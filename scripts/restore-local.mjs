#!/usr/bin/env node
/**
 * D1 本番データをローカル開発環境に復元するスクリプト
 *
 * 使い方:
 *   1. 別ターミナルで `npm run dev` を起動しておく（任意、API 復元の場合のみ）
 *   2. `npm run restore` を実行
 *
 * 動作:
 *   - `wrangler d1 export todo-app-db --remote` でリモート D1 をエクスポート
 *   - `wrangler d1 execute todo-app-db --local` でローカル D1 に適用
 */

import { execSync } from "child_process";
import { unlinkSync, existsSync } from "fs";

const DB_NAME = "todo-app-db";
const TMP = "/tmp/d1-restore.sql";

// ── リモート D1 をエクスポート ────────────────────────────────────
console.log(`📥 D1 (${DB_NAME}) からデータをエクスポート中...`);
try {
  execSync(
    `npx wrangler d1 export ${DB_NAME} --remote --output "${TMP}"`,
    { stdio: "inherit" },
  );
} catch {
  console.error("❌ D1 エクスポートに失敗しました。`wrangler login` を確認してください。");
  process.exit(1);
}

if (!existsSync(TMP)) {
  console.error("❌ エクスポートファイルが見つかりません。");
  process.exit(1);
}
console.log("✅ エクスポート完了");

// ── ローカル D1 に適用 ───────────────────────────────────────────
console.log(`\n🔁 ローカル D1 (${DB_NAME}) に適用中...`);
try {
  execSync(
    `npx wrangler d1 execute ${DB_NAME} --local --file "${TMP}"`,
    { stdio: "inherit" },
  );
} catch {
  console.error("❌ ローカル D1 への適用に失敗しました。");
  unlinkSync(TMP);
  process.exit(1);
}

unlinkSync(TMP);
console.log("✅ ローカル D1 への復元が完了しました。");
