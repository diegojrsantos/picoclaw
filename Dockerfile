FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN wget -O pc.tar.gz https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_x86_64.tar.gz \
    && tar xzf pc.tar.gz && rm pc.tar.gz && ls -la

ENV PICOCLAW_GATEWAY_HOST=0.0.0.0
CMD ["sh", "-c", "./picoclaw onboard || true; ./picoclaw gateway"]
