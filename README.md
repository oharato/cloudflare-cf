# TODO アプリ — Cloudflare Static Assets + Durable Objects (SQLite)

Cloudflare Workers エコシステムを活用したフルスタック TODO アプリです。

- **フロントエンド**: Cloudflare Static Assets (`assets/index.html`)
- **バックエンド API**: Cloudflare Durable Objects (SQLite ストレージ)
- **ルーター**: Cloudflare Workers

## アーキテクチャ

```
ブラウザ
  │
  ▼
Cloudflare Worker (src/index.ts)
  ├─ GET /          → Static Assets            → assets/index.html
  └─ /api/todos/*   → TodoDB (Durable Object)  → SQLite CRUD
                         │
                         └─ ctx.storage.sql.exec(...)
```

| コンポーネント | 技術 | 役割 |
|---|---|---|
| `src/index.ts` | Cloudflare Worker | リクエストルーティング |
| `src/todo-db.ts` | Durable Object + SQLite | TODO の CRUD (GET/POST/PATCH/DELETE) |
| `assets/index.html` | Cloudflare Static Assets | フロントエンド UI |

## API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/todos` | TODO 一覧取得 |
| `POST` | `/api/todos` | TODO 作成 `{ "title": "..." }` |
| `PATCH` | `/api/todos/:id` | タイトル変更 / 完了切替 |
| `DELETE` | `/api/todos/:id` | 削除 |

## 前提条件

- [Node.js](https://nodejs.org/) v18 以上
- Cloudflare アカウント (無料プランで利用可能)

## セットアップ

```bash
# 依存関係インストール
npm install

# Cloudflare にログイン
npx wrangler login
```

## 開発

```bash
# ローカル開発サーバー起動
npm run dev
```

## デプロイ

```bash
npm run deploy
```

デプロイ時に Worker + Durable Object + Static Assets が一括でデプロイされます。

## プロジェクト構成

```
cloudflare-cf/
├── .vscode/
│   └── mcp.json          # Cloudflare MCP サーバー設定
├── assets/
│   └── index.html        # フロントエンド UI (Static Assets で配信)
├── src/
│   ├── index.ts          # Worker エントリーポイント
│   └── todo-db.ts        # Durable Object (SQLite CRUD)
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

## MCP サーバー

`.vscode/mcp.json` に以下の Cloudflare MCP サーバーを設定しています。Copilot からドキュメント参照や Bindings 操作が可能です。

| サーバー | URL |
|---|---|
| ドキュメント | `docs.mcp.cloudflare.com` |
| Bindings | `bindings.mcp.cloudflare.com` |
| Containers | `containers.mcp.cloudflare.com` |
