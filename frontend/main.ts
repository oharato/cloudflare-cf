import Alpine from "alpinejs";

const API = "/api/todos";

interface Todo {
  id: number;
  title: string;
  completed: number;
  created_at: string;
}

Alpine.data("todoApp", () => ({
  todos: [] as Todo[],
  newTitle: "" as string,
  loading: true as boolean,
  error: "" as string,

  get activeTodos(): Todo[] {
    return this.todos.filter((t: Todo) => !t.completed);
  },

  get completedTodos(): Todo[] {
    return this.todos.filter((t: Todo) => t.completed);
  },

  async init() {
    await this.fetchTodos();
  },

  async fetchTodos() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.todos = await res.json();
    } catch {
      this.error = "データの取得に失敗しました";
    } finally {
      this.loading = false;
    }
  },

  async addTodo() {
    const title = (this.newTitle as string).trim();
    if (!title) return;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const todo: Todo = await res.json();
      (this.todos as Todo[]).unshift(todo);
      this.newTitle = "";
    } catch {
      this.error = "追加に失敗しました";
    }
  },

  async toggleTodo(todo: Todo) {
    try {
      const res = await fetch(`${API}/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Todo = await res.json();
      const idx = (this.todos as Todo[]).findIndex((t: Todo) => t.id === todo.id);
      if (idx !== -1) (this.todos as Todo[])[idx] = updated;
    } catch {
      this.error = "更新に失敗しました";
    }
  },

  async deleteTodo(id: number) {
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      this.todos = (this.todos as Todo[]).filter((t: Todo) => t.id !== id);
    } catch {
      this.error = "削除に失敗しました";
    }
  },

  formatDate(iso: string): string {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  },
}));

Alpine.start();
