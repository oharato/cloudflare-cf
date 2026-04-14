# TODO アプリ — Cloudflare Workers + Durable Objects (SQLite) + VOICEVOX

Cloudflare Workers エコシステムを活用したフルスタック TODO アプリです。  
TODO のテキストを VOICEVOX Container で非同期に音声合成し、ブラウザから再生できます。

- **フロントエンド**: Vite + Alpine.js + Pico.css → Cloudflare Static Assets
- **バックエンド API**: Hono ルーター on Cloudflare Workers
- **ストレージ**: Cloudflare Durable Objects (SQLite)
- **音声合成**: VOICEVOX on Cloudflare Containers (Cron Trigger で 5 分おきに起動)

## アーキテクチャ

```
ブラウザ
  │
  ▼
Cloudflare Worker (src/index.ts)
  ├─ GET /          → Static Assets (assets/)
  ├─ /api/*         → TodoDB (Durable Object / SQLite)
  │                      CRUD + 音声データ BLOB 管理
  └─ Cron (*/5 * * * *)
       └─ VoiceContainer (VOICEVOX + Node.js proxy)
              POST /synthesize → gzip WAV → DB BLOB
```

| コンポーネント | 技術 | 役割 |
|---|---|---|
| `src/index.ts` | Cloudflare Worker + Hono | ルーティング / Cron ハンドラ |
| `src/todo-db.ts` | Durable Object + SQLite | TODO CRUD + 音声 API |
| `src/voice-container.ts` | Cloudflare Containers | VOICEVOX DO クラス定義 |
| `container/voice/` | Docker (ubuntu:24.04 + VOICEVOX + Node.js) | 音声合成プロキシサーバー |
| `frontend/` | Vite + Alpine.js + Pico.css | フロントエンドソース |
| `assets/` | Cloudflare Static Assets | Vite ビルド出力 (配信用) |

## API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/todos` | TODO 一覧取得 |
| `POST` | `/api/todos` | TODO 作成 `{ "title": "..." }` |
| `PATCH` | `/api/todos/:id` | タイトル変更 / 完了切替 |
| `DELETE` | `/api/todos/:id` | 削除 |
| `GET` | `/api/todos/:id/voice` | 音声データ取得 (WAV) |

## 前提条件

- [Node.js](https://nodejs.org/) v18 以上
- [Docker](https://www.docker.com/) (Container イメージビルドに必要)
- Cloudflare アカウント (**Workers Paid プラン** — Containers 利用に必須)
- Cloudflare にログイン済みであること

## セットアップ

```bash
# 依存関係インストール
npm install

# Cloudflare にログイン (初回のみ)
npx wrangler login
```

## 開発

```bash
# フロントエンド開発サーバー (Vite HMR)
npm run dev:frontend

# Worker ローカル開発 (Miniflare)
npm run dev
```

> ローカル開発では Container / Cron は動作しません。フロントエンドの `/api` リクエストは `npm run dev` で起動した Worker に向けます。

## デプロイ

### 初回デプロイ

```bash
# 1. フロントエンドをビルドして assets/ へ出力
npm run build:frontend

# 2. Worker + DO + Container + Static Assets を一括デプロイ
npx wrangler deploy
```

または上記 2 ステップをまとめて実行:

```bash
npm run deploy
```

> **注意**: Container イメージ (VOICEVOX) は展開後 約 2.1 GB のため、初回ビルド・プッシュに数分かかります。Docker Desktop が起動していることを確認してください。

### 2 回目以降

```bash
npm run deploy
```

### Container インスタンスタイプ

`wrangler.jsonc` の `instance_type` で変更できます。VOICEVOX の展開サイズが 2.1 GB のため `basic` 以上が必要です。

| タイプ | vCPU | Memory | Disk | 用途 |
|---|---|---|---|---|
| `basic` | 1/4 | 1 GiB | **4 GB** | 最小構成 (デフォルト) |
| `standard-1` | 1/2 | 4 GiB | **8 GB** | 余裕がほしい場合 |

### デプロイエラー対処

| エラー | 原因 | 対処 |
|---|---|---|
| `Image too large: needs XXXMB, but limited to 2000MB` | `instance_type` がデフォルト `lite` (2GB) | `wrangler.jsonc` の `instance_type` を `"basic"` 以上に変更 |
| `script does not export class 'TodoContainer'` | 旧 Container クラスが Cloudflare 側に残存 | `src/container.ts` の `TodoContainer` が `src/index.ts` からエクスポートされていることを確認 |
| `Durable Object reset because its code was updated.` | デプロイ直後に旧 DO インスタンスが切断 | 一時的なエラー。次回 Cron 実行時に自動復旧 |
| `A request to the Cloudflare API failed` | 認証切れ | `npx wrangler login` を再実行 |
| Docker not running | Container ビルドに Docker が必要 | Docker Desktop を起動してから再実行 |

## ログ確認

```bash
# リアルタイムログ (Cron の処理状況・エラーを確認)
npx wrangler tail todo-app --format pretty

# フィルタ例
npx wrangler tail todo-app --format pretty | grep -E "Voice|ERROR|Alarm"
```

Dashboard でも確認できます: **Cloudflare Dashboard → Workers → todo-app → Logs**  
（`observability.enabled: true` により 7 日間保持）

## Cron Trigger (音声合成)

デプロイ後、Cloudflare Dashboard → Workers → **todo-app** → **Triggers** タブから手動実行できます。  
本番では `*/5 * * * *`（5 分おき）で自動実行されます。

音声合成フロー:
```
Cron 起動 → pending TODO 取得 → VoiceContainer POST /synthesize
→ VOICEVOX audio_query + synthesis → gzip 圧縮 → DB に BLOB 保存
→ voice_status: pending → processing → done
→ フロントエンドが 15 秒ごとにポーリング → 🔊 ボタン表示
```

## プロジェクト構成

```
cloudflare-cf/
├── .vscode/
│   └── mcp.json                # Cloudflare MCP サーバー設定
├── assets/                     # Vite ビルド出力 (自動生成・Static Assets で配信)
├── container/
│   └── voice/
│       ├── Dockerfile          # ubuntu:24.04 + VOICEVOX v0.25.1 + Node.js 20
│       ├── start.sh            # VOICEVOX 起動待機 → Node プロキシ起動
│       ├── server.js           # HTTP プロキシ port 3001 (gzip 圧縮)
│       └── package.json
├── frontend/
│   ├── index.html              # Alpine.js ディレクティブ付き HTML
│   ├── main.ts                 # Alpine.js コンポーネント
│   └── style.css               # Pico.css violet + カスタムスタイル
├── src/
│   ├── index.ts                # Worker エントリーポイント + Cron ハンドラ
│   ├── todo-db.ts              # Durable Object (SQLite CRUD + 音声 API)
│   ├── voice-container.ts      # VoiceContainer クラス定義 (port 3001, sleepAfter 30m)
│   └── container.ts            # TodoContainer (旧クラス・後方互換用エクスポート)
├── wrangler.jsonc
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## MCP サーバー

`.vscode/mcp.json` に以下の Cloudflare MCP サーバーを設定しています。Copilot からドキュメント参照や Bindings 操作が可能です。

| サーバー | URL |
|---|---|
| ドキュメント | `docs.mcp.cloudflare.com` |
| Bindings | `bindings.mcp.cloudflare.com` |
| Containers | `containers.mcp.cloudflare.com` |


## アーキテクチャ

```
ブラウザ
  │
  ▼
Cloudflare Worker (src/index.ts)
  ├─ GET /          → Static Assets (assets/)
  ├─ /api/*         → TodoDB (Durable Object / SQLite)
  │                      CRUD + 音声データ BLOB 管理
  └─ Cron (*/5 * * * *)
       └─ VoiceContainer (VOICEVOX + Node.js proxy)
              POST /synthesize → gzip WAV → DB BLOB
```

| コンポーネント | 技術 | 役割 |
|---|---|---|
| `src/index.ts` | Cloudflare Worker + Hono | ルーティング / Cron ハンドラ |
| `src/todo-db.ts` | Durable Object + SQLite | TODO CRUD + 音声 API |
| `src/voice-container.ts` | Cloudflare Containers | VOICEVOX DO クラス定義 |
| `container/voice/` | Docker (VOICEVOX + Node.js) | 音声合成プロキシサーバー |
| `frontend/` | Vite + Alpine.js + Pico.css | フロントエンドソース |
| `assets/` | Cloudflare Static Assets | Vite ビルド出力 (配信用) |

## API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/todos` | TODO 一覧取得 |
| `POST` | `/api/todos` | TODO 作成 `{ "title": "..." }` |
| `PATCH` | `/api/todos/:id` | タイトル変更 / 完了切替 |
| `DELETE` | `/api/todos/:id` | 削除 |
| `GET` | `/api/todos/:id/voice` | 音声データ取得 (WAV) |

## 前提条件

- [Node.js](https://nodejs.org/) v18 以上
- [Docker](https://www.docker.com/) (Container イメージビルドに必要)
- Cloudflare アカウント (**Workers Paid プラン** — Containers 利用に必須)
- Cloudflare にログイン済みであること

## セットアップ

```bash
# 依存関係インストール
npm install

# Cloudflare にログイン (初回のみ)
npx wrangler login
```

## 開発

```bash
# フロントエンド開発サーバー (Vite HMR)
npm run dev:frontend

# Worker ローカル開発 (Miniflare)
npm run dev
```

> ローカル開発では Container / Cron は動作しません。フロントエンドの `/api` リクエストは `npm run dev` で起動した Worker に向けます。

## デプロイ

### 初回デプロイ

```bash
# 1. フロントエンドをビルドして assets/ へ出力
npm run build:frontend

# 2. Worker + DO + Container + Static Assets を一括デプロイ
npx wrangler deploy
```

または上記 2 ステップをまとめて実行:

```bash
npm run deploy
```

> **注意**: Container イメージ (VOICEVOX) は約 2 GB のため、初回ビルド・プッシュに数分かかります。Docker Desktop が起動していることを確認してください。

### 2 回目以降

```bash
npm run deploy
```

### デプロイエラー対処

| エラー | 原因 | 対処 |
|---|---|---|
| `script does not export class 'TodoContainer'` | 旧 Container クラスが Cloudflare 側に残存 | `src/container.ts` の `TodoContainer` が `src/index.ts` からエクスポートされていることを確認 |
| `A request to the Cloudflare API failed` | 認証切れ | `npx wrangler login` を再実行 |
| Docker not running | Container ビルドに Docker が必要 | Docker Desktop を起動してから再実行 |

## Cron Trigger (音声合成)

デプロイ後、Cloudflare Dashboard → Workers → **todo-app** → **Triggers** タブから手動実行できます。  
本番では `*/5 * * * *`（5 分おき）で自動実行されます。

音声合成フロー:
```
Cron 起動 → pending TODO 取得 → VoiceContainer POST /synthesize
→ VOICEVOX audio_query + synthesis → gzip 圧縮 → DB に BLOB 保存
→ voice_status: pending → processing → done
→ フロントエンドが 15 秒ごとにポーリング → 🔊 ボタン表示
```

## プロジェクト構成

```
cloudflare-cf/
├── .vscode/
│   └── mcp.json                # Cloudflare MCP サーバー設定
├── assets/                     # Vite ビルド出力 (自動生成・Static Assets で配信)
├── container/
│   └── voice/
│       ├── Dockerfile          # VOICEVOX + Node.js プロキシ
│       ├── start.sh            # 起動スクリプト
│       ├── server.js           # HTTP プロキシ (port 3001)
│       └── package.json
├── frontend/
│   ├── index.html              # Alpine.js ディレクティブ付き HTML
│   ├── main.ts                 # Alpine.js コンポーネント
│   └── style.css               # Pico.css + カスタムスタイル
├── src/
│   ├── index.ts                # Worker エントリーポイント + Cron ハンドラ
│   ├── todo-db.ts              # Durable Object (SQLite CRUD + 音声 API)
│   ├── voice-container.ts      # VoiceContainer クラス定義
│   └── container.ts            # TodoContainer (旧クラス、後方互換用)
├── wrangler.jsonc
├── package.json
├── tsconfig.json
└── vite.config.ts
```
```

## MCP サーバー

`.vscode/mcp.json` に以下の Cloudflare MCP サーバーを設定しています。Copilot からドキュメント参照や Bindings 操作が可能です。

| サーバー | URL |
|---|---|
| ドキュメント | `docs.mcp.cloudflare.com` |
| Bindings | `bindings.mcp.cloudflare.com` |
| Containers | `containers.mcp.cloudflare.com` |
