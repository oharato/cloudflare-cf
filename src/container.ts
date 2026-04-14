import { Container } from "@cloudflare/containers";

export class TodoContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "15m";

  override onStart() {
    console.log("TodoContainer: フロントエンドサーバー起動");
  }

  override onStop() {
    console.log("TodoContainer: フロントエンドサーバー停止");
  }

  override onError(error: unknown) {
    console.error("TodoContainer エラー:", error);
  }
}
