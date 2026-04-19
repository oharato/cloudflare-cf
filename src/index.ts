import { Hono } from "hono";
import { cors } from "hono/cors";
import { VoiceContainer } from "./voice-container.ts";
import { TodoContainer } from "./container.ts";
import { todoRouter, runVoiceSynthesis, type Env } from "./todo-service.ts";

export { VoiceContainer, TodoContainer };

const app = new Hono<{ Bindings: Env }>();
app.use(cors());
app.route("/", todoRouter);

// 静的ファイルは Cloudflare Static Assets が自動配信

export default {
  fetch: app.fetch,

  // Cron Trigger: */5 * * * *  → 未処理 TODO を VOICEVOX で音声合成
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runVoiceSynthesis(env);
  },
};
