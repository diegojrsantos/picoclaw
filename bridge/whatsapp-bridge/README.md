# Bridge WhatsApp para o PicoClaw

O canal **WhatsApp** do PicoClaw v0.3.1 tem dois modos:

| Modo | Como funciona | Situação no binário publicado |
|---|---|---|
| `native` (whatsmeow) | QR direto no terminal, sem serviço externo | **NÃO está compilado** — exige `go build -tags whatsapp_native` |
| `bridge` | o PicoClaw conecta via WebSocket num serviço externo | **Está compilado** — funciona com o binário que já está no ar |

Confirmado nas strings do binário `picoclaw_Linux_x86_64.tar.gz` (v0.3.1):

```
WhatsApp bridge                        PRESENTE
WhatsApp channel connected             PRESENTE
whatsapp native not compiled in        PRESENTE   <- o modo nativo e' o stub
Scan this QR code                      ausente    <- modo nativo fora do binario
```

Ou seja: **o modo bridge funciona hoje sem recompilar nada.** Este diretorio e'
o servico que do outro lado dessa conexao.

## Protocolo

O PicoClaw e' o **cliente** do WebSocket (`pkg/channels/whatsapp/whatsapp.go`):

```
PicoClaw -> bridge : {"type":"message","to":"<chatID>","content":"..."}
bridge -> PicoClaw : {"type":"message","from":"<senderID>","chat":"<chatID>",
                       "content":"...","media":[],"id":"...","from_name":"..."}
```

O `from`/`chat` sao numeros de telefone **sem** o sufixo (`551199999999`).

## Rodar local (parear o WhatsApp)

```bash
cd bridge/whatsapp-bridge
npm install
npm start            # imprime o QR code; escaneie em Aparelhos conectados
```

O QR sai tambem como **imagem**: o bridge imprime uma URL
`https://api.qrserver.com/v1/create-qr-code/?data=...` — abra no celular e
escaneie a imagem. (O QR do WhatsApp expira em ~30s e um novo e' gerado
automaticamente.)

A sessao pareada fica em `auth_info/`. Copie essa pasta para manter o pareamento
se for trocar de maquina.

## Expor o bridge para a internet (a Hostless precisa alcancar)

A Hostless so consegue sair para a internet — o bridge precisa de uma URL
publica. Opcoes:

**a) Cloudflare Tunnel (rapido, ja usado neste projeto)**

```bash
cloudflared tunnel --url ws://localhost:3001
# -> wss://algum-subdominio.trycloudflare.com
```

Use esse `wss://...` no `PICOCLAW_CHANNELS_WHATSAPP_BRIDGE_URL`.

**b) VPS proprio** com Node 20+ rodando `npm start` e um proxy TLS (nginx/caddy)
terminando em `wss://seu-dominio.com`.

## Configurar o PicoClaw (na Hostless)

```
PICOCLAW_CHANNELS_WHATSAPP_BRIDGE_URL   = wss://seu-bridge:443
PICOCLAW_CHANNELS_WHATSAPP_ALLOW_FROM   = 551199999999
```

O `entrypoint.sh` desta repo traduz essas variaveis para o `config.json`
(formato v0.3.1):

```json
"channel_list": {
  "whatsapp": {
    "enabled": true,
    "type": "whatsapp",
    "allow_from": ["551199999999"],
    "settings": { "bridge_url": "wss://seu-bridge:443" }
  }
}
```

Sem `ALLOW_FROM` o bot responde a **qualquer numero**. Com ele, so o numero
listado conversa.

## Testar sem parear o WhatsApp

O modo `--inject` simula uma mensagem de entrada (util para validar o lado do
PicoClaw e o agent sem usar o WhatsApp de verdade):

```bash
node index.js --inject 551199999999 "oi, sou eu"
```

E o cliente de teste que fala o mesmo protocolo do PicoClaw:

```bash
node fake-picoclaw.js
```

## Rodar o bridge DENTRO da Hostless (2a app)

A Hostless **nao tem disco persistente** (nao existe chave `volumes` no
`hostless.yaml`), entao a sessao do WhatsApp se perde a cada deploy. Duas
saidas:

1. **Rodar o bridge fora** (PC ou VPS) — o mais simples, e' o recomendado.
2. **Rodar o bridge na Hostless** e salvar a sessao em variavel de ambiente:
   o bridge grava `creds.b64` sempre que a sessao muda. Copie esse conteudo
   para a variavel `WA_CREDS_B64` da app; no boot o bridge restaura a sessao a
   partir dela. A cada re-pareamento, atualize a variavel.

## Variaveis de ambiente do bridge

| Variavel | Padrao | Para que serve |
|---|---|---|
| `BRIDGE_PORT` | `3001` | porta do WebSocket |
| `BRIDGE_HOST` | `0.0.0.0` | bind do WebSocket |
| `AUTH_DIR` | `./auth_info` | pasta da sessao do WhatsApp |
| `WA_CREDS_B64` | vazio | sessao compactada em base64 (restaurar no boot) |
| `QR_IMAGE_URL` | api.qrserver.com | template da imagem do QR |
| `LOG_LEVEL` | `info` | `debug` mostra o payload das mensagens |

## Aviso honesto

O Baileys (WhatsApp Web) **nao e' a API oficial** do WhatsApp. Para uso pessoal
funciona bem, mas a Meta pode pedir o pareamento de novo ou banir o numero se
detectar uso automatizado em volume. Se for para um numero de negocio, use a
**WhatsApp Business Cloud API** (oficial) e um adapter proprio no lugar deste
bridge.
