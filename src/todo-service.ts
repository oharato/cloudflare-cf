import { Hono } from "hono";

export interface Todo {
  id: number;
  title: string;
  completed: number;
  created_at: string;
  voice_status: "pending" | "processing" | "done" | "error";
  voice_r2_key: string | null;
}

// CRUD ルートが使うバインディング（VOICE_CONTAINER は不要）
export interface CrudEnv {
  TODOS_DB: D1Database;
  TODO_VOICE: R2Bucket;
}

// Worker 全体の Env（Cron も含む）
export interface Env extends CrudEnv {
  VOICE_CONTAINER: DurableObjectNamespace;
}

// CORS・認証などのミドルウェアは index.ts 側で設定する
export const todoRouter = new Hono<{ Bindings: CrudEnv }>();

// GET /api/todos - 一覧取得
todoRouter.get("/api/todos", async (c) => {
  const { results } = await c.env.TODOS_DB
    .prepare(
      "SELECT id, title, completed, created_at, voice_status FROM todos ORDER BY created_at DESC",
    )
    .all<Todo>();
  return c.json(results);
});

// POST /api/todos - 作成
todoRouter.post("/api/todos", async (c) => {
  const body = await c.req.json<{ title?: string }>();
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "title は必須です" }, 400);
  const todo = await c.env.TODOS_DB
    .prepare(
      "INSERT INTO todos (title) VALUES (?) RETURNING id, title, completed, created_at, voice_status",
    )
    .bind(title)
    .first<Todo>();
  return c.json(todo, 201);
});

// PATCH /api/todos/:id - 更新
todoRouter.patch("/api/todos/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ title?: string; completed?: boolean }>();
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return c.json({ error: "title は空にできません" }, 400);
    await c.env.TODOS_DB
      .prepare("UPDATE todos SET title = ? WHERE id = ?")
      .bind(title, id)
      .run();
  }
  if (body.completed !== undefined) {
    await c.env.TODOS_DB
      .prepare("UPDATE todos SET completed = ? WHERE id = ?")
      .bind(body.completed ? 1 : 0, id)
      .run();
  }
  const todo = await c.env.TODOS_DB
    .prepare(
      "SELECT id, title, completed, created_at, voice_status FROM todos WHERE id = ?",
    )
    .bind(id)
    .first<Todo>();
  if (!todo) return c.json({ error: "見つかりません" }, 404);
  return c.json(todo);
});

// DELETE /api/todos/:id - 削除（R2 音声ファイルも削除）
todoRouter.delete("/api/todos/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const row = await c.env.TODOS_DB
    .prepare("SELECT voice_r2_key FROM todos WHERE id = ?")
    .bind(id)
    .first<{ voice_r2_key: string | null }>();
  await c.env.TODOS_DB.prepare("DELETE FROM todos WHERE id = ?").bind(id).run();
  if (row?.voice_r2_key) {
    await c.env.TODO_VOICE.delete(row.voice_r2_key).catch(() => {});
  }
  return new Response(null, { status: 204 });
});

// GET /api/todos/:id/voice - R2 から音声データを取得して gzip 展開
todoRouter.get("/api/todos/:id/voice", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const row = await c.env.TODOS_DB
    .prepare(
      "SELECT voice_r2_key FROM todos WHERE id = ? AND voice_status = 'done'",
    )
    .bind(id)
    .first<{ voice_r2_key: string | null }>();
  if (!row?.voice_r2_key) return c.json({ error: "音声データなし" }, 404);

  const obj = await c.env.TODO_VOICE.get(row.voice_r2_key);
  if (!obj) return c.json({ error: "音声ファイルが見つかりません" }, 404);

  const ds = new DecompressionStream("gzip");
  const stream = obj.body.pipeThrough(ds);
  return new Response(stream, { headers: { "Content-Type": "audio/wav" } });
});

// Cron: 音声合成（pending → R2 に保存）
// 個別 todo のエラーはこの関数内で完結する（呼び出し元への再 throw はしない）
export async function runVoiceSynthesis(env: Env): Promise<void> {
  const voiceStub = env.VOICE_CONTAINER.get(
    env.VOICE_CONTAINER.idFromName("singleton"),
  );

  while (true) {
    const { results: pending } = await env.TODOS_DB
      .prepare(
        `UPDATE todos
         SET voice_status = 'processing'
         WHERE id IN (SELECT id FROM todos WHERE voice_status = 'pending')
         RETURNING id, title`,
      )
      .all<{ id: number; title: string }>();

    if (pending.length === 0) {
      console.log("[Voice] 未処理タスクなし - 終了");
      break;
    }

    console.log(`[Voice] ${pending.length} 件の音声合成を開始`);

    for (const todo of pending) {
      try {
        const synthRes = await voiceStub.fetch(
          new Request("http://voice/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: todo.title }),
          }),
        );

        if (!synthRes.ok) {
          throw new Error(
            `VOICEVOX エラー: ${synthRes.status} ${await synthRes.text()}`,
          );
        }

        const audioData = await synthRes.arrayBuffer();
        const key = `voice/${todo.id}.wav.gz`;

        await env.TODO_VOICE.put(key, audioData, {
          httpMetadata: { contentType: "audio/wav", contentEncoding: "gzip" },
        });

        await env.TODOS_DB
          .prepare(
            "UPDATE todos SET voice_r2_key = ?, voice_status = 'done' WHERE id = ?",
          )
          .bind(key, todo.id)
          .run();

        console.log(`[Voice] Todo ${todo.id} 「${todo.title}」 完了`);
      } catch (err) {
        const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        console.error(`[Voice] Todo ${todo.id} 「${todo.title}」 失敗: ${msg}`);
        await env.TODOS_DB
          .prepare("UPDATE todos SET voice_status = 'error' WHERE id = ?")
          .bind(todo.id)
          .run();
      }
    }
  }
}
