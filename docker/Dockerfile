FROM debian:bookworm-slim

ARG PICOCLAW_VERSION=v0.3.1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Tag fixa: o codigo do config (version 3) e o normalizeModel() desta versao
# sao a base do entrypoint.sh. Um "latest" novo mudaria o formato sem aviso.
RUN wget -qO pc.tar.gz "https://github.com/sipeed/picoclaw/releases/download/${PICOCLAW_VERSION}/picoclaw_Linux_x86_64.tar.gz" \
 && tar xzf pc.tar.gz picoclaw \
 && rm pc.tar.gz \
 && chmod +x /app/picoclaw \
 && test -x /app/picoclaw

# Materializa o workspace na imagem (onboard no build, nao no boot, para nao
# atrasar o health check). Este PICOCLAW_HOME vale so no BUILD: em runtime o
# rootfs e read-only e o entrypoint reexporta PICOCLAW_HOME para /tmp.
ENV PICOCLAW_HOME=/app/.picoclaw \
    PICOCLAW_GATEWAY_HOST=0.0.0.0
RUN mkdir -p "$PICOCLAW_HOME/workspace" \
 && (timeout 60 /app/picoclaw onboard </dev/null >/dev/null 2>&1 || true) \
 && chmod -R a+rwX "$PICOCLAW_HOME" \
 && test -d "$PICOCLAW_HOME/workspace"

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# A Hostless injeta PORT=8000; o entrypoint repassa para PICOCLAW_GATEWAY_PORT.

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
