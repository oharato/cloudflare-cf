# 使い方

## 前提条件

- [Node.js](https://nodejs.org/) v18 以上
- [Docker](https://www.docker.com/) (Container イメージビルドに必要)
- Cloudflare アカウント (**Workers Paid プラン** — Containers 利用に必須)

## セットアップ

```bash
# 依存関係インストール
npm install

# Cloudflare にログイン (初回のみ)
npx wrangler login

# R2 バケット作成 (初回のみ)
npx wrangler r2 bucket create todo-app-backup
```

## ローカル開発

```bash
# フロントエンド開発サーバー (Vite HMR)
npm run dev:frontend

# Worker ローカル開発 (Miniflare)
npm run dev
```

> ローカル開発では Container / Cron は動作しません。フロントエンドの `/api` リクエストは `npm run dev` で起動した Worker に向けます。

## デプロイ

```bash
npm run deploy
```

> **注意**: Container イメージ (VOICEVOX) は展開後 約 2.1 GB のため、初回ビルド・プッシュに数分かかります。Docker Desktop が起動していることを確認してください。

### Container インスタンスタイプ

`wrangler.jsonc` の `instance_type` で変更できます。VOICEVOX の展開サイズが 2.1 GB のため `basic` 以上が必要です。

| タイプ | vCPU | Memory | Disk |
|---|---|---|---|
| `basic` | 1/4 | 1 GiB | **4 GB** (デフォルト) |
| `standard-1` | 1/2 | 4 GiB | **8 GB** |

### デプロイエラー対処

| エラー | 原因 | 対処 |
|---|---|---|
| `Image too large: needs XXXMB, but limited to 2000MB` | `instance_type` がデフォルト `lite` (2GB disk) | `wrangler.jsonc` の `instance_type` を `"basic"` 以上に変更 |
| `script does not export class 'TodoContainer'` | 旧 Container クラスが Cloudflare 側に残存 | `src/container.ts` の `TodoContainer` が `src/index.ts` からエクスポートされているか確認 |
| `Durable Object reset because its code was updated.` | デプロイ直後に旧 DO インスタンスが切断 | 一時的なエラー。次回 Cron 実行時に自動復旧 |
| `A request to the Cloudflare API failed` | 認証切れ | `npx wrangler login` を再実行 |
| Docker not running | Container ビルドに Docker が必要 | Docker Desktop を起動してから再実行 |

## ログ確認

```bash
# リアルタイムログ (Cron の処理状況・エラーを確認)
npx wrangler tail todo-app --format pretty

# フィルタ例
npx wrangler tail todo-app --format pretty | grep -E "Voice|Backup|ERROR"
```

Dashboard でも確認できます: **Cloudflare Dashboard → Workers → todo-app → Logs**  
（`observability.enabled: true` により 7 日間保持）

## Cron の手動実行

Cloudflare Dashboard → Workers → **todo-app** → **Triggers** タブから手動実行できます。

## R2 バックアップ操作

```bash
# バックアップ一覧
npx wrangler r2 object list todo-app-backup

# 最新ダンプをダウンロード
npx wrangler r2 object get todo-app-backup/backups/latest.sql --file latest.sql

# SQLite DB としてリストア
sqlite3 restored.db < latest.sql
```
