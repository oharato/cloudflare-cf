import { Container } from "@cloudflare/containers";

export class VoiceContainer extends Container {
  // VOICEVOX プロキシサーバーのポート
  defaultPort = 3001;
  // 最後のリクエストから 30 分後にスリープ（VOICEVOX は起動が重いため長めに設定）
  sleepAfter = "30m";

  override onStart() {
    console.log("VoiceContainer: VOICEVOX エンジン起動中...");
  }

  override onStop() {
    console.log("VoiceContainer: 停止");
  }

  override onError(error: unknown) {
    console.error("VoiceContainer エラー:", error);
  }
}
