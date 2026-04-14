import { Hono } from "hono";
import { TodoDB } from "./todo-db.ts";

export { TodoDB };

interface Env {
  TODO_DB: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// /api/todos/* を Durable Object (SQLite) へ転送
app.all("/api/todos/*", async (c) => {
  const id = c.env.TODO_DB.idFromName("global");
  const stub = c.env.TODO_DB.get(id);
  return stub.fetch(c.req.raw);
});

// 静的ファイルは Cloudflare Static Assets が自動配信
export default app;
