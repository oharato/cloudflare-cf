#!/usr/bin/env node
/**
 * ローカル開発用 音声合成バッチ
 *
 * 使い方:
 *   1. 別ターミナルで `npm run dev` を起動
 *   2. `npm run voice` を実行（Dockerコンテナの自動ビルド・起動込み）
 */

import { gzipSync } from "zlib";
import { execSync, spawnSync } from "child_process";

const DEV_URL = "http://localhost:8787";
const VOICE_PROXY_URL = "http://localhost:3001";
const DOCKERFILE_DIR = new URL("../container/voice", import.meta.url).pathname;
const CONTAINER_NAME = "voicevox-local";
const IMAGE_NAME = "voicevox-local:latest";

// ── Docker コンテナ起動 ──────────────────────────────────────────
function isContainerRunning() {
  try {
    const out = execSync(
      `docker inspect --format '{{.State.Running}}' ${CONTAINER_NAME} 2>/dev/null`,
      { encoding: "utf8" },
    ).trim();
    return out === "true";
  } catch {
    return false;
  }
}

async function waitForProxy(maxSeconds = 120) {
  process.stdout.write(`   起動待機中 (最大${maxSeconds}秒)`);
  for (let i = 0; i < maxSeconds; i++) {
    try {
      const res = await fetch(`${VOICE_PROXY_URL}/health`);
      if (res.ok) { console.log(" 準備完了"); return; }
    } catch { /* 待機 */ }
    await new Promise((r) => setTimeout(r, 1000));
    if (i % 10 === 9) process.stdout.write(".");
  }
  console.error("\n❌ プロキシの起動タイムアウト");
  process.exit(1);
}

if (!isContainerRunning()) {
  console.log("🐳 Docker イメージをビルド中...");
  const buildResult = spawnSync(
    "docker", ["build", "-t", IMAGE_NAME, DOCKERFILE_DIR],
    { stdio: "inherit" },
  );
  if (buildResult.status !== 0) {
    console.error("❌ Docker ビルド失敗");
    process.exit(1);
  }

  console.log("🚀 コンテナを起動中...");
  spawnSync(
    "docker",
    ["run", "-d", "--rm", "--name", CONTAINER_NAME, "-p", "3001:3001", IMAGE_NAME],
    { stdio: "inherit" },
  );

  await waitForProxy();
} else {
  console.log(`✅ コンテナ「${CONTAINER_NAME}」は既に起動済み`);
}

// ── テキストを音声合成して gzip 圧縮バイナリを返す ───────────────
// コンテナのプロキシ (port 3001 /synthesize) に POST して gzip WAV を受け取る
async function synthesize(text) {
  const res = await fetch(`${VOICE_PROXY_URL}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`synthesize 失敗: ${res.status} ${await res.text()}`);
  // プロキシはすでに gzip 圧縮済みバイナリを返す
  return Buffer.from(await res.arrayBuffer());
}

// ── pending 取得 ─────────────────────────────────────────────────
const pendingRes = await fetch(`${DEV_URL}/api/voice/pending`).catch(() => null);
if (!pendingRes?.ok) {
  console.error(`❌ pending 取得失敗\n   先に別ターミナルで "npm run dev" を起動してください。`);
  process.exit(1);
}
const pending = await pendingRes.json();

if (pending.length === 0) {
  console.log("✅ 未処理タスクなし");
  process.exit(0);
}

console.log(`\n🔊 ${pending.length} 件の音声合成を開始\n`);

let succeeded = 0;
let failed = 0;

for (const todo of pending) {
  process.stdout.write(`  [${todo.id}] 「${todo.title.slice(0, 30)}」... `);

  await fetch(`${DEV_URL}/api/voice/${todo.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "processing" }),
  });

  try {
    const audioData = await synthesize(todo.title);

    await fetch(`${DEV_URL}/api/voice/${todo.id}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: audioData,
    });

    console.log("✅ 完了");
    succeeded++;
  } catch (err) {
    console.log(`❌ 失敗: ${err.message}`);
    await fetch(`${DEV_URL}/api/voice/${todo.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error" }),
    });
    failed++;
  }
}

console.log(`\n完了: ${succeeded} 件成功, ${failed} 件失敗`);
