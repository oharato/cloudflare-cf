# TODO アプリ — Cloudflare Workers + Durable Objects (SQLite) + VOICEVOX

https://todo-app.oharato.workers.dev/

Cloudflare Workers エコシステムを活用したフルスタック TODO アプリです。  
TODO のテキストを VOICEVOX Container で非同期に音声合成し、ブラウザから再生できます。

- **フロントエンド**: Vite + Alpine.js + Pico.css → Cloudflare Static Assets
- **バックエンド API**: Hono ルーター on Cloudflare Workers
- **ストレージ**: Cloudflare Durable Objects (SQLite)
- **音声合成**: VOICEVOX on Cloudflare Containers (Cron Trigger で 5 分おきに起動)
- **バックアップ**: Cloudflare R2 に SQLite の SQL ダンプを毎時自動保存

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/usage.md](docs/usage.md) | セットアップ・開発・デプロイ・ログ確認・バックアップ操作 |
| [docs/spec.md](docs/spec.md) | API 仕様・スキーマ・Cron・制限値・技術スタック |
| [docs/architecture.md](docs/architecture.md) | システム構成図・データフロー・プロジェクト構成 |

