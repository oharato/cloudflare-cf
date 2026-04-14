import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Todo {
  id: number;
  title: string;
  completed: number;
  created_at: string;
}

export class TodoDB extends DurableObject {
  private sql: SqlStorage;
  private app: Hono;

  constructor(ctx: DurableObjectState, env: never) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT    NOT NULL,
        completed  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.app = this.createRouter();
  }

  private createRouter(): Hono {
    const app = new Hono();

    app.use(cors());

    // GET /api/todos - 一覧取得
    app.get("/api/todos", (c) => {
      const todos = this.sql
        .exec("SELECT * FROM todos ORDER BY created_at DESC")
        .toArray() as unknown as Todo[];
      return c.json(todos);
    });

    // POST /api/todos - 作成
    app.post("/api/todos", async (c) => {
      const body = await c.req.json<{ title?: string }>();
      const title = body?.title?.trim();
      if (!title) return c.json({ error: "title は必須です" }, 400);
      const todo = this.sql
        .exec("INSERT INTO todos (title) VALUES (?) RETURNING *", title)
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
        .exec("SELECT * FROM todos WHERE id = ?", id)
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

    return app;
  }

  async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request);
  }
}
