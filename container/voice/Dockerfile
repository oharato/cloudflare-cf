FROM voicevox/voicevox_engine:cpu-ubuntu24.04-latest

# Node.js 24 インストール
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# プロキシサーバー配置
WORKDIR /proxy
COPY package.json server.js start.sh ./
RUN chmod +x start.sh

# プロキシが待ち受けるポート
EXPOSE 3001

ENTRYPOINT ["/proxy/start.sh"]
