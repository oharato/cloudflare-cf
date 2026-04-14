import Alpine from "alpinejs";

const API = "/api/todos";

interface Todo {
  id: number;
  title: string;
  completed: number;
  created_at: string;
  voice_status: "pending" | "processing" | "done" | "error";
}

Alpine.data("todoApp", () => ({
  todos: [] as Todo[],
  newTitle: "" as string,
  loading: true as boolean,
  error: "" as string,
  playingId: null as number | null,

  get activeTodos(): Todo[] {
    return this.todos.filter((t: Todo) => !t.completed);
  },

  get completedTodos(): Todo[] {
    return this.todos.filter((t: Todo) => t.completed);
  },

  async init() {
    await this.fetchTodos();
    // pending / processing がある間は 15 秒ごとに自動更新
    setInterval(async () => {
      const hasPending = (this.todos as Todo[]).some(
        (t: Todo) =>
          t.voice_status === "pending" || t.voice_status === "processing",
      );
      if (hasPending) await this.fetchTodos();
    }, 15_000);
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
      const idx = (this.todos as Todo[]).findIndex(
        (t: Todo) => t.id === todo.id,
      );
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

  async playAudio(id: number) {
    if (this.playingId === id) return;
    this.playingId = id;
    try {
      const res = await fetch(`${API}/${id}/voice`);
      if (!res.ok) throw new Error("音声データなし");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.playingId = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.playingId = null;
        this.error = "音声の再生に失敗しました";
      };
      await audio.play();
    } catch {
      this.error = "音声再生に失敗しました";
      this.playingId = null;
    }
  },

  voiceIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: "🕐",
      processing: "⚙️",
      error: "⚠️",
    };
    return icons[status] ?? "";
  },

  formatDate(iso: string): string {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  },
}));

Alpine.start();

