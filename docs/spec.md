# 仕様書

## 技術スタック

| レイヤー | 技術 | バージョン |
|---|---|---|
| ランタイム | Cloudflare Workers | — |
| ルーター | Hono | v4.12.12 |
| ストレージ | Durable Objects (SQLite) | — |
| 音声合成エンジン | VOICEVOX | v0.25.1 |
| Container 基盤 | Cloudflare Containers | — |
| バックアップ | Cloudflare R2 | — |
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
| `DELETE` | `/api/todos/:id` | — | `{ "success": true }` | 削除 |

### 音声

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/todos/:id/voice` | 音声データ取得 (WAV, Content-Type: audio/wav) |
| `GET` | `/api/voice/pending` | voice_status = 'pending' の TODO 一覧 (Cron 用内部 API) |
| `PATCH` | `/api/voice/:id/status` | voice_status 更新 `{ "status": "processing" \| "done" \| "error" }` |
| `POST` | `/api/voice/:id/data` | 音声 BLOB 保存 (binary body) |

### 管理

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/admin/db-dump` | 全データを SQL INSERT 形式でエクスポート (プレーンテキスト) |

## SQLite スキーマ

```sql
CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,
  voice_status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'processing' | 'done' | 'error'
  voice_data  BLOB,                               -- gzip 圧縮 WAV (nullable)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Cron Triggers

| スケジュール | 処理 | 説明 |
|---|---|---|
| `*/5 * * * *` | VOICEVOX 音声合成 | pending TODO を取得し VOICEVOX Container に合成依頼 |
| `0 * * * *` | R2 バックアップ | DB 全データを SQL 形式で R2 に保存 |

### 音声合成フロー詳細

```
pending TODO 取得
  → VoiceContainer POST /synthesize { text }
  → voice_status: pending → processing
  → VOICEVOX audio_query + synthesis (WAV)
  → gzip 圧縮 → voice_data BLOB に保存
  → voice_status: done (or error)
```

### R2 バックアップ保存先

| ファイル | 説明 |
|---|---|
| `backups/{ISO 8601 timestamp}.sql` | タイムスタンプ付き (蓄積・削除されない) |
| `backups/latest.sql` | 常に最新で上書き |

バックアップ形式: `CREATE TABLE` 文 + 全行の `INSERT INTO` 文 (プレーン SQL テキスト)  
`voice_data` は `X'<hex>'` 形式の BLOB リテラルとして出力

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

## Durable Objects 設定

| クラス | バインディング | 用途 |
|---|---|---|
| `TodoDB` | `TODO_DB` | TODO データ + 音声 BLOB (SQLite) |
| `VoiceContainer` | `VOICE_CONTAINER` | VOICEVOX Container 管理 |

### ストレージ制限

| 項目 | 上限 |
|---|---|
| DO 1 インスタンスあたりのディスク | **10 GB** (Workers Paid プラン) |
| SQLite 1 行あたりの BLOB | **2 MB** |

> VOICEVOX gzip 圧縮 WAV が 2 MB を超える場合は `voice_data` への保存が失敗します。  
> 長文テキストの場合は R2 への保存に切り替えてください。

## R2 バケット

| 項目 | 値 |
|---|---|
| バケット名 | `todo-app-backup` |
| Binding 名 | `TODO_BACKUP` |

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
