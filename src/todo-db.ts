import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Todo {
  id: number;
  title: string;
  completed: number;
  created_at: string;
  voice_status: "pending" | "processing" | "done" | "error";
}

export class TodoDB extends DurableObject {
  private sql: SqlStorage;
  private app: Hono;

  constructor(ctx: DurableObjectState, env: never) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    // テーブル作成（voice カラム込み）
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        completed    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voice_status TEXT    NOT NULL DEFAULT 'pending',
        voice_data   BLOB
      )
    `);

    // 既存テーブルへのカラム追加マイグレーション
    for (const stmt of [
      "ALTER TABLE todos ADD COLUMN voice_status TEXT NOT NULL DEFAULT 'pending'",
      "ALTER TABLE todos ADD COLUMN voice_data BLOB",
    ]) {
      try {
        this.sql.exec(stmt);
      } catch {
        /* already exists */
      }
    }

    this.app = this.createRouter();
  }

  private createRouter(): Hono {
    const app = new Hono();

    app.use(cors());

    // ── TODO CRUD ────────────────────────────────────────────────

    // GET /api/todos - 一覧取得（voice_data は除外）
    app.get("/api/todos", (c) => {
      const todos = this.sql
        .exec(
          "SELECT id, title, completed, created_at, voice_status FROM todos ORDER BY created_at DESC",
        )
        .toArray() as unknown as Todo[];
      return c.json(todos);
    });

    // POST /api/todos - 作成
    app.post("/api/todos", async (c) => {
      const body = await c.req.json<{ title?: string }>();
      const title = body?.title?.trim();
      if (!title) return c.json({ error: "title は必須です" }, 400);
      const todo = this.sql
        .exec(
          "INSERT INTO todos (title) VALUES (?) RETURNING id, title, completed, created_at, voice_status",
          title,
        )
        .one() as unknown as Todo;
      return c.json(todo, 201);
    });

    // PATCH /api/todos/:id - 更新
    app.patch("/api/todos/:id", async (c) => {
      const id = parseInt(c.req.param("id"), 10);
      const body = await c.req.json<{ title?: string; completed?: boolean }>();
      if (body.title !== undefined) {
        const title = body.title.trim();
        if (!title) return c.json({ error: "title は空にできません" }, 400);
        this.sql.exec("UPDATE todos SET title = ? WHERE id = ?", title, id);
      }
      if (body.completed !== undefined) {
        this.sql.exec(
          "UPDATE todos SET completed = ? WHERE id = ?",
          body.completed ? 1 : 0,
          id,
        );
      }
      const todo = this.sql
        .exec(
          "SELECT id, title, completed, created_at, voice_status FROM todos WHERE id = ?",
          id,
        )
        .toArray()[0] as unknown as Todo | undefined;
      if (!todo) return c.json({ error: "見つかりません" }, 404);
      return c.json(todo);
    });

    // DELETE /api/todos/:id - 削除
    app.delete("/api/todos/:id", (c) => {
      const id = parseInt(c.req.param("id"), 10);
      this.sql.exec("DELETE FROM todos WHERE id = ?", id);
      return new Response(null, { status: 204 });
    });

    // GET /api/todos/:id/voice - 音声データ取得（gzip 展開して WAV 返却）
    app.get("/api/todos/:id/voice", (c) => {
      const id = parseInt(c.req.param("id"), 10);
      const row = this.sql
        .exec(
          "SELECT voice_data FROM todos WHERE id = ? AND voice_status = 'done'",
          id,
        )
        .toArray()[0] as { voice_data: ArrayBuffer | null } | undefined;

      if (!row?.voice_data) return c.json({ error: "音声データなし" }, 404);

      // gzip を展開して WAV として返す
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([row.voice_data]).stream().pipeThrough(ds);
      return new Response(stream, { headers: { "Content-Type": "audio/wav" } });
    });

    // ── Voice 処理 API（Cron Worker から呼ばれる）────────────────

    // GET /api/voice/pending - 音声合成待ち一覧
    app.get("/api/voice/pending", (c) => {
      const todos = this.sql
        .exec(
          "SELECT id, title FROM todos WHERE voice_status = 'pending' ORDER BY id ASC",
        )
        .toArray() as unknown as { id: number; title: string }[];
      return c.json(todos);
    });

    // PATCH /api/voice/:id/status - ステータス更新
    app.patch("/api/voice/:id/status", async (c) => {
      const id = parseInt(c.req.param("id"), 10);
      const { status } = await c.req.json<{ status: string }>();
      this.sql.exec(
        "UPDATE todos SET voice_status = ? WHERE id = ?",
        status,
        id,
      );
      return c.json({ ok: true });
    });

    // POST /api/voice/:id/data - 圧縮済み音声 BLOB を保存
    app.post("/api/voice/:id/data", async (c) => {
      const id = parseInt(c.req.param("id"), 10);
      const audioData = await c.req.arrayBuffer();
      this.sql.exec(
        "UPDATE todos SET voice_data = ?, voice_status = 'done' WHERE id = ?",
        new Uint8Array(audioData),
        id,
      );
      return c.json({ ok: true });
    });

    return app;
  }

  async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request);
  }
}

