# 仕様書

## 技術スタック

| レイヤー | 技術 | バージョン |
|---|---|---|
| ランタイム | Cloudflare Workers | — |
| ルーター | Hono | v4.x |
| データベース | Cloudflare D1 (SQLite) | — |
| 音声ファイル保管 | Cloudflare R2 | — |
| 音声合成エンジン | VOICEVOX | v0.25.1 |
| Container 基盤 | Cloudflare Containers | — |
| フロントエンドビルド | Vite | v8.x |
| フロントエンド UI | Alpine.js + Pico.css (violet) | — |
| 静的配信 | Cloudflare Static Assets | — |

## REST API

### TODO

| メソッド | パス | リクエスト | レスポンス | 説明 |
|---|---|---|---|---|
| `GET` | `/api/todos` | — | `Todo[]` (JSON) | 一覧取得 |
| `POST` | `/api/todos` | `{ "title": string }` | `Todo` (JSON) | 作成 |
| `PATCH` | `/api/todos/:id` | `{ "title"?: string, "completed"?: boolean }` | `Todo` (JSON) | 更新 |
| `DELETE` | `/api/todos/:id` | — | 204 No Content | 削除 (R2 音声ファイルも削除) |

### 音声

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/todos/:id/voice` | 音声データ取得 (WAV, Content-Type: audio/wav) |

### Todo オブジェクト

```typescript
interface Todo {
  id: number;
  title: string;
  completed: number;          // 0 | 1
  created_at: string;         // ISO 8601
  voice_status: "pending" | "processing" | "done" | "error";
  voice_r2_key: string | null; // R2 オブジェクトキー (voice/{id}.wav.gz)
}
```

## D1 スキーマ

```sql
CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  completed    INTEGER NOT NULL DEFAULT 0,
  voice_status TEXT    NOT NULL DEFAULT 'pending',
  voice_r2_key TEXT,                              -- R2 キー (nullable)
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

## Cron Triggers

| スケジュール | 処理 | 説明 |
|---|---|---|
| `*/5 * * * *` | VOICEVOX 音声合成 | pending TODO を D1 から取得し VoiceContainer に合成依頼 → R2 に保存 |

### 音声合成フロー詳細

```
pending TODO を processing に原子的に更新して取得
  → VoiceContainer POST /synthesize { text }
  → VOICEVOX audio_query + synthesis (WAV)
  → gzip 圧縮バイナリを R2 PUT voice/{id}.wav.gz
  → D1 UPDATE voice_r2_key=?, voice_status='done'
  → エラー時: voice_status='error'
```

## VOICEVOX Container

| 項目 | 値 |
|---|---|
| ベースイメージ | `ubuntu:24.04` |
| VOICEVOX バージョン | `0.25.1` (GitHub Releases からバイナリダウンロード) |
| リッスンポート (Container 内部) | `50021` (VOICEVOX エンジン) |
| プロキシポート (Worker 向け) | `3001` (Node.js proxy server) |
| `instance_type` | `basic` (1/4 vCPU, 1 GiB RAM, 4 GB disk) |
| `max_instances` | `1` |
| `sleepAfter` | `30m` |

## Durable Objects / Bindings

| クラス | バインディング | 用途 |
|---|---|---|
| `VoiceContainer` | `VOICE_CONTAINER` | VOICEVOX Container 管理 |
| `TodoContainer` | (バインディングなし) | 後方互換エクスポートのみ |

| リソース | バインディング | 用途 |
|---|---|---|
| D1 `todo-app-db` | `TODOS_DB` | TODO データ永続化 |
| R2 `todo-app-voice` | `TODO_VOICE` | gzip WAV ファイル保管 |

## フロントエンド仕様

| 項目 | 値 |
|---|---|
| ビルドツール | Vite |
| フレームワーク | Alpine.js |
| CSS | Pico.css (violet テーマ) |
| ビルド出力 | `assets/` |
| 音声ポーリング間隔 | 15 秒 (voice_status が pending/processing の間) |
| 音声再生 | `GET /api/todos/:id/voice` → `<audio>` 要素で再生 |

## MCP サーバー設定

`.vscode/mcp.json` に設定済み。GitHub Copilot から Cloudflare リソースを操作できます。

| サーバー | URL |
|---|---|
| ドキュメント | `docs.mcp.cloudflare.com` |
| Bindings | `bindings.mcp.cloudflare.com` |
| Containers | `containers.mcp.cloudflare.com` |
