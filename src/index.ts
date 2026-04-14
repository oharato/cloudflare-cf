import { Hono } from "hono";
import { TodoDB } from "./todo-db.ts";
import { VoiceContainer } from "./voice-container.ts";
import { TodoContainer } from "./container.ts";

export { TodoDB, VoiceContainer, TodoContainer };

interface Env {
  TODO_DB: DurableObjectNamespace;
  VOICE_CONTAINER: DurableObjectNamespace;
  TODO_BACKUP: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

// すべての API リクエストを TodoDB (Durable Object) へ転送
app.all("/api/*", async (c) => {
  const stub = c.env.TODO_DB.get(c.env.TODO_DB.idFromName("global"));
  return stub.fetch(c.req.raw);
});

// 静的ファイルは Cloudflare Static Assets が自動配信
// R2 バックアップ処理
async function backupToR2(env: Env): Promise<void> {
  try {
    const dbStub = env.TODO_DB.get(env.TODO_DB.idFromName("global"));
    const dumpRes = await dbStub.fetch(
      new Request("http://internal/api/admin/db-dump"),
    );
    if (!dumpRes.ok) {
      console.error(`[Backup] dump 取得失敗: ${dumpRes.status}`);
      return;
    }
    const dumpData = await dumpRes.text();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `backups/${timestamp}.sql`;

    await Promise.all([
      // タイムスタンプ付きバックアップ (30 日間保持)
      env.TODO_BACKUP.put(key, dumpData, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
        customMetadata: { size: String(dumpData.length) },
      }),
      // 最新バックアップ (常に上書き)
      env.TODO_BACKUP.put("backups/latest.sql", dumpData, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
        customMetadata: { size: String(dumpData.length), timestamp },
      }),
    ]);

    console.log(
      `[Backup] R2 に保存完了: ${key} (${(dumpData.length / 1024).toFixed(1)} KB)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(`[Backup] エラー: ${msg}`);
  }
}

export default {
  fetch: app.fetch,

  // Cron Trigger:
  //   */5 * * * *  → 未処理 TODO を VOICEVOX で音声合成
  //   0 * * * *    → SQLite ファイルを R2 にバックアップ
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // 毎時 0 分: SQLite ファイルを R2 にバックアップ
    if (_event.cron === "0 * * * *") {
      await backupToR2(env);
      return;
    }

    try {
      const dbStub = env.TODO_DB.get(env.TODO_DB.idFromName("global"));
      const voiceStub = env.VOICE_CONTAINER.get(
        env.VOICE_CONTAINER.idFromName("singleton"),
      );

      // 未処理がなくなるまでループ
      while (true) {
        const pendingRes = await dbStub.fetch(
          new Request("http://internal/api/voice/pending"),
        );
        if (!pendingRes.ok) {
          console.error(`[Voice] pending 取得失敗: ${pendingRes.status} ${await pendingRes.text()}`);
          break;
        }
        const pending = (await pendingRes.json()) as {
          id: number;
          title: string;
        }[];

        if (pending.length === 0) {
          console.log("[Voice] 未処理タスクなし - 終了");
          break;
        }

        console.log(`[Voice] ${pending.length} 件の音声合成を開始`);

        for (const todo of pending) {
          // 処理中に更新
          await dbStub.fetch(
            new Request(`http://internal/api/voice/${todo.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "processing" }),
            }),
          );

          try {
            // VOICEVOX コンテナに音声合成リクエスト（gzip 圧縮済みバイナリが返る）
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

            // 圧縮済み音声 BLOB を DB に保存
            await dbStub.fetch(
              new Request(`http://internal/api/voice/${todo.id}/data`, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: audioData,
              }),
            );

            console.log(`[Voice] Todo ${todo.id} 「${todo.title}」 完了`);
          } catch (err) {
            const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
            console.error(`[Voice] Todo ${todo.id} 「${todo.title}」 失敗: ${msg}`);
            await dbStub.fetch(
              new Request(`http://internal/api/voice/${todo.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "error" }),
              }),
            );
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      console.error(`[Voice] scheduled() 全体エラー: ${msg}`);
      throw err;
    }
  },
};
