#!/bin/sh
set -eu

CONFIG_DIR="${HOME:-/root}/.picoclaw"
CONFIG="$CONFIG_DIR/config.json"
PORT_FINAL="${PICOCLAW_GATEWAY_PORT:-${PORT:-8000}}"

mkdir -p "$CONFIG_DIR/workspace"

# O PicoClaw so aplica PICOCLAW_* via env.Parse QUANDO o config.json existe.
# Rodamos onboard uma vez para materializar os templates do workspace.
if [ ! -f "$CONFIG" ]; then
  /app/picoclaw onboard </dev/null >/dev/null 2>&1 || true
fi

# As tags env dos providers usam "{{.Name}}", que a lib caarlos0/env NAO interpola.
# Por isso a API key do LLM precisa entrar direto no JSON.
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

PROVIDER="${PICOCLAW_LLM_PROVIDER:-openrouter}"
case "$PROVIDER" in
  openrouter|openai|anthropic|zhipu|gemini|groq|moonshot|nvidia|vllm|shengsuanyun) ;;
  *) echo "PICOCLAW_LLM_PROVIDER invalido: $PROVIDER" >&2; exit 1 ;;
esac

KEY_JSON="$(json_escape "${PICOCLAW_LLM_API_KEY:-}")"

cat > "$CONFIG" <<EOF
{
  "providers": {
    "$PROVIDER": {
      "api_key": "$KEY_JSON"
    }
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": $PORT_FINAL
  },
  "heartbeat": {
    "enabled": false,
    "interval": 30
  }
}
EOF
chmod 600 "$CONFIG"

# Defaults derivados, pra reduzir o numero de variaveis no painel.
export PICOCLAW_GATEWAY_PORT="$PORT_FINAL"
export PICOCLAW_AGENTS_DEFAULTS_PROVIDER="${PICOCLAW_AGENTS_DEFAULTS_PROVIDER:-$PROVIDER}"
export PICOCLAW_AGENTS_DEFAULTS_MODEL="${PICOCLAW_AGENTS_DEFAULTS_MODEL:-${PICOCLAW_MODEL:-openai/gpt-4o-mini}}"

# Se o token do Telegram foi setado, liga o canal automaticamente.
if [ -n "${PICOCLAW_CHANNELS_TELEGRAM_TOKEN:-}" ]; then
  export PICOCLAW_CHANNELS_TELEGRAM_ENABLED=true
fi

echo "==> picoclaw gateway em 0.0.0.0:$PORT_FINAL | provider=$PROVIDER"
exec /app/picoclaw gateway
