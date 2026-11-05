#!/bin/sh
set -eu

# PicoClaw v0.3.1 usa config "version 3": model_list + agents.defaults.model_name.
# O binario do release NAO e o mesmo codigo do branch feat/agent-browser-tool.
PORT_FINAL="${PICOCLAW_GATEWAY_PORT:-${PORT:-8000}}"

case "$PORT_FINAL" in
  ''|*[!0-9]*) PORT_FINAL=8000 ;;
esac

# Na Hostless o rootfs (incluindo /app) e montado READ-ONLY. NUNCA testar
# escrita com redirecionamento: no dash isso e fatal (exit 2) mesmo dentro de
# um if, e o fallback nunca chega a rodar. [ -w ] nao faz redirecionamento.
if [ -w /tmp ]; then
  CONFIG_DIR="/tmp/picoclaw-home"
elif [ -w /dev/shm ]; then
  CONFIG_DIR="/dev/shm/picoclaw-home"
else
  CONFIG_DIR="${HOME:-/root}/.picoclaw"
fi

mkdir -p "$CONFIG_DIR/workspace"
# O workspace vem embutido na imagem (onboard roda no build) e e copiado para
# o diretorio gravavel, ja que /app nao aceita escrita em runtime.
if [ -d /app/.picoclaw/workspace ]; then
  cp -R /app/.picoclaw/workspace/. "$CONFIG_DIR/workspace/" 2>/dev/null || true
fi
export PICOCLAW_HOME="$CONFIG_DIR"
CONFIG="$CONFIG_DIR/config.json"
echo "==> home gravavel: $CONFIG_DIR" >&2

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

KEY_JSON="$(json_escape "${PICOCLAW_LLM_API_KEY:-}")"
# A API da NVIDIA exige o ID completo "nvidia/nemotron-3.5-bolt-e4b", mas o
# normalizeModel() do PicoClaw remove o primeiro segmento "nvidia/". O prefixo
# duplicado compensa esse strip e faz o request sair com o nome oficial.
MODEL_JSON="$(json_escape "${PICOCLAW_MODEL:-nvidia/nvidia/nemotron-3.5-bolt-e4b}")"
TOKEN_JSON="$(json_escape "${PICOCLAW_CHANNELS_TELEGRAM_TOKEN:-}")"
ALLOW_JSON="$(json_escape "${PICOCLAW_CHANNELS_TELEGRAM_ALLOW_FROM:-}")"
# WhatsApp no v0.3.1 tem dois modos: "native" (whatsmeow, exige binario compilado
# com -tags whatsapp_native) e "bridge" (WebSocket para um servico externo).
# O binario do release so tem o modo BRIDGE (conferido nas strings do release),
# entao aqui so configuramos o bridge: settings.bridge_url.
WA_BRIDGE_JSON="$(json_escape "${PICOCLAW_CHANNELS_WHATSAPP_BRIDGE_URL:-}")"
WA_ALLOW_JSON="$(json_escape "${PICOCLAW_CHANNELS_WHATSAPP_ALLOW_FROM:-}")"

# Monta o channel_list: cada canal so entra se tiver a sua credencial/URL.
# Sem isso o deploy sobe verde, mas sem nenhum canal ativo.
CHANNEL_ITEMS=""
add_channel() {
  if [ -z "$CHANNEL_ITEMS" ]; then
    CHANNEL_ITEMS="$1"
  else
    CHANNEL_ITEMS="$CHANNEL_ITEMS, $1"
  fi
}

if [ -n "$TOKEN_JSON" ]; then
  if [ -n "$ALLOW_JSON" ]; then
    ALLOW_ARR="[\"$ALLOW_JSON\"]"
  else
    ALLOW_ARR="[]"
  fi
  add_channel "\"telegram\": { \"enabled\": true, \"type\": \"telegram\", \"allow_from\": $ALLOW_ARR, \"settings\": { \"token\": \"$TOKEN_JSON\" } }"
fi

if [ -n "$WA_BRIDGE_JSON" ]; then
  if [ -n "$WA_ALLOW_JSON" ]; then
    WA_ALLOW_ARR="[\"$WA_ALLOW_JSON\"]"
  else
    WA_ALLOW_ARR="[]"
  fi
  add_channel "\"whatsapp\": { \"enabled\": true, \"type\": \"whatsapp\", \"allow_from\": $WA_ALLOW_ARR, \"settings\": { \"bridge_url\": \"$WA_BRIDGE_JSON\" } }"
fi

if [ -n "$CHANNEL_ITEMS" ]; then
  CHANNELS_BLOCK="\"channel_list\": { $CHANNEL_ITEMS },"
  CHANNELS_ENABLED="$(echo "$CHANNEL_ITEMS" | grep -o '"type": "[a-z_]*"' | sed -e 's/"type": "//' -e 's/"//' | tr '\n' ' ')"
else
  CHANNELS_BLOCK=""
  CHANNELS_ENABLED="(nenhum)"
fi

cat > "$CONFIG" <<EOF
{
  "version": 3,
  "agents": {
    "defaults": {
      "workspace": "$CONFIG_DIR/workspace",
      "model_name": "nemotron-bolt",
      "max_tokens": 4096,
      "temperature": 1.0
    }
  },
  "model_list": [
    {
      "model_name": "nemotron-bolt",
      "provider": "nvidia",
      "model": "$MODEL_JSON",
      "api_keys": ["$KEY_JSON"],
      "api_base": "https://integrate.api.nvidia.com/v1",
      "enabled": true
    }
  ],
  $CHANNELS_BLOCK
  "heartbeat": { "enabled": false },
  "gateway": {
    "host": "0.0.0.0",
    "port": $PORT_FINAL,
    "hot_reload": false,
    "log_level": "info"
  }
}
EOF
chmod 600 "$CONFIG"

# env.Parse aplica PICOCLAW_GATEWAY_HOST/PORT por cima do JSON.
export PICOCLAW_GATEWAY_HOST=0.0.0.0
export PICOCLAW_GATEWAY_PORT="$PORT_FINAL"

if [ -z "${PICOCLAW_LLM_API_KEY:-}" ]; then
  echo "AVISO: PICOCLAW_LLM_API_KEY nao definida. O /health sobe, mas as respostas do agente vao falhar." >&2
fi

echo "==> picoclaw gateway em 0.0.0.0:$PORT_FINAL | model=$MODEL_JSON"
echo "==> canais ativos: $CHANNELS_ENABLED"
exec /app/picoclaw gateway
