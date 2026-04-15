#!/usr/bin/env node
/**
 * R2 の最新バックアップをローカル開発サーバーに復元するスクリプト
 *
 * 使い方:
 *   1. 別ターミナルで `npm run dev` を起動しておく
 *   2. `npm run restore` を実行
 */

import { execSync } from "child_process";
import { readFileSync, unlinkSync, existsSync } from "fs";

const DEV_URL = "http://localhost:8787";
const BUCKET = "todo-app-backup";
const KEY = "backups/latest.sql";
const TMP = "/tmp/todo-backup-restore.sql";

// ── R2 からダウンロード ──────────────────────────────────────────
console.log(`📥 R2 (${BUCKET}/${KEY}) からバックアップを取得中...`);
try {
  execSync(
    `npx wrangler r2 object get "${BUCKET}/${KEY}" --file "${TMP}" --remote`,
    { stdio: "inherit" },
  );
} catch {
  console.error("❌ R2 からの取得に失敗しました。`wrangler login` を確認してください。");
  process.exit(1);
}

if (!existsSync(TMP)) {
  console.error("❌ ダウンロードされたファイルが見つかりません。");
  process.exit(1);
}

const sql = readFileSync(TMP, "utf8");
unlinkSync(TMP);
console.log(`✅ 取得完了 (${(sql.length / 1024).toFixed(1)} KB)`);

// ── ローカル dev サーバーへ POST ─────────────────────────────────
console.log(`\n🔁 ${DEV_URL}/api/admin/db-restore へ復元中...`);
let res;
try {
  res = await fetch(`${DEV_URL}/api/admin/db-restore`, {
    method: "POST",
    body: sql,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
} catch {
  console.error(`❌ 接続できませんでした。\n   先に別ターミナルで "npm run dev" を起動してください。`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`❌ 復元失敗 (HTTP ${res.status}):`, await res.text());
  process.exit(1);
}

const { restored } = await res.json();
console.log(`✅ 復元完了! ${restored} 件のタスクをインポートしました。`);
