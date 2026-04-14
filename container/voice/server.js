// VOICEVOX エンジン（localhost:50021）へのプロキシサーバー
// テキストを受け取り、音声合成して gzip 圧縮した WAV を返す

const http = require("http");
const zlib = require("zlib");

const VOICEVOX_BASE = "http://localhost:50021";
const PORT = process.env.PORT || 3001;
const DEFAULT_SPEAKER = 1; // ずんだもん（ノーマル）

const server = http.createServer(async (req, res) => {
  // ヘルスチェック
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method !== "POST" || req.url !== "/synthesize") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not Found" }));
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { text, speaker = DEFAULT_SPEAKER } = JSON.parse(body);
      if (!text || typeof text !== "string") {
        throw new Error("text は必須の文字列です");
      }

      // Step 1: audio_query — テキストから音声クエリを生成
      const queryRes = await fetch(
        `${VOICEVOX_BASE}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
        { method: "POST" },
      );
      if (!queryRes.ok) {
        throw new Error(`audio_query 失敗: ${queryRes.status}`);
      }
      const audioQuery = await queryRes.json();

      // Step 2: synthesis — 音声クエリから WAV を生成
      const synthRes = await fetch(
        `${VOICEVOX_BASE}/synthesis?speaker=${speaker}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(audioQuery),
        },
      );
      if (!synthRes.ok) {
        throw new Error(`synthesis 失敗: ${synthRes.status}`);
      }
      const wavBuffer = Buffer.from(await synthRes.arrayBuffer());

      // Step 3: gzip 圧縮して返す
      zlib.gzip(wavBuffer, (err, compressed) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: err.message }));
        }
        console.log(
          `[Synth] "${text.slice(0, 20)}..." ` +
            `WAV=${wavBuffer.length}B → gzip=${compressed.length}B`,
        );
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "X-Original-Size": String(wavBuffer.length),
          "X-Compressed-Size": String(compressed.length),
        });
        res.end(compressed);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Synth] エラー:", message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Voice proxy ready on port ${PORT}`);
});
