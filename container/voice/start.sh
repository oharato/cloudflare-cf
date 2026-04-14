#!/bin/bash
set -e

echo "=== VOICEVOX + Proxy Startup ==="

# VOICEVOX エンジンをバックグラウンドで起動
if [ -f /opt/voicevox_engine/run ]; then
  /opt/voicevox_engine/run --host 0.0.0.0 --port 50021 &
elif [ -f /opt/voicevox_engine/voicevox_engine ]; then
  /opt/voicevox_engine/voicevox_engine --host 0.0.0.0 --port 50021 &
elif [ -f /opt/voicevox_engine/run.py ]; then
  cd /opt/voicevox_engine && python3 run.py --host 0.0.0.0 --port 50021 &
else
  echo "[ERROR] VOICEVOX engine が見つかりません"
  ls /opt/voicevox_engine/ 2>/dev/null || echo "  /opt/voicevox_engine が存在しません"
  exit 1
fi

VV_PID=$!
echo "VOICEVOX PID: $VV_PID"

# VOICEVOX が起動するまで待機（最大 120 秒）
echo "VOICEVOX の起動を待機中..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:50021/version > /dev/null 2>&1; then
    VERSION=$(curl -s http://localhost:50021/version)
    echo "VOICEVOX 準備完了 (v${VERSION}, ${i}×2s)"
    break
  fi
  if [ $i -eq 60 ]; then
    echo "[ERROR] VOICEVOX の起動がタイムアウトしました"
    exit 1
  fi
  sleep 2
done

echo "プロキシサーバーを起動..."
exec node /proxy/server.js
