'use strict';

/**
 * Bridge WhatsApp <-> WebSocket para o canal "whatsapp" do PicoClaw v0.3.1.
 *
 * O PicoClaw (modo bridge) é o CLIENTE: ele conecta via WebSocket neste
 * servidor e fala um JSON simples:
 *
 *   PicoClaw -> bridge : {"type":"message","to":"<chatID>","content":"..."}
 *   bridge -> PicoClaw : {"type":"message","from":"<senderID>","chat":"<chatID>",
 *                         "content":"...","media":[],"id":"...","from_name":"..."}
 *
 * (Protocolo conferido em pkg/channels/whatsapp/whatsapp.go do upstream v0.3.1.)
 *
 * Este lado usa Baileys (WhatsApp Web sem navegador). O numero precisa estar
 * pareado via QR (Linked Devices) uma unica vez; a sessao fica em AUTH_DIR.
 *
 * Variaveis de ambiente:
 *   BRIDGE_PORT   porta do WebSocket (padrao 3001)
 *   BRIDGE_HOST   bind do WebSocket (padrao 0.0.0.0)
 *   AUTH_DIR      pasta da sessao WhatsApp (padrao ./auth_info)
 *   WA_CREDS_B64  sessao compactada em base64 (para restaurar em rede sem disco)
 *   QR_IMAGE_URL  template de URL que gera a imagem do QR a partir do link
 *   LOG_LEVEL     debug | info (padrao info)
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const qrcode = require('qrcode-terminal');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const PORT = parseInt(process.env.BRIDGE_PORT || '3001', 10);
const HOST = process.env.BRIDGE_HOST || '0.0.0.0';
const AUTH_DIR = path.resolve(process.env.AUTH_DIR || path.join(__dirname, 'auth_info'));
const CREDS_B64 = process.env.WA_CREDS_B64 || '';
const QR_IMAGE_URL = process.env.QR_IMAGE_URL || 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=';
const DEBUG = (process.env.LOG_LEVEL || 'info').toLowerCase() === 'debug';

const log = (...args) => console.log('[bridge]', ...args);
const dbg = (...args) => { if (DEBUG) console.log('[bridge:debug]', ...args); };

// ---------------------------------------------------------------- sessao ---

/** Compacta a pasta de sessao inteira em um unico base64 (para env var). */
function packAuthDir(dir) {
  const files = {};
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) {
      files[name] = fs.readFileSync(full).toString('base64');
    }
  }
  return Buffer.from(JSON.stringify(files), 'utf8').toString('base64');
}

/** Restaura a pasta de sessao a partir do base64 compacto. */
function unpackAuthDir(dir, b64) {
  const files = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'));
  }
  return Object.keys(files).length;
}

// ------------------------------------------------------------- websocket ---

const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

function startServer() {
  const server = require('http').createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('picoclaw whatsapp bridge\n');
  });
  wss.handleUpgrade = wss.handleUpgrade.bind(wss);
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  server.listen(PORT, HOST, () => log(`servidor websocket em ws://${HOST}:${PORT}`));
  return server;
}

wss.on('connection', (ws) => {
  clients.add(ws);
  log(`PicoClaw conectado (conexoes ativas: ${clients.size})`);

  ws.on('message', (raw) => { handleFromPicoclaw(raw); });
  ws.on('close', () => {
    clients.delete(ws);
    log(`PicoClaw desconectado (conexoes ativas: ${clients.size})`);
  });
  ws.on('error', (err) => log('erro no websocket:', err.message));
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  let sent = 0;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      sent++;
    }
  }
  dbg(`mensagem entregue a ${sent} cliente(s)`);
  if (sent === 0) log('AVISO: nenhuma conexao do PicoClaw ativa, mensagem descartada');
}

async function handleFromPicoclaw(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch (err) {
    log('mensagem invalida do PicoClaw:', err.message);
    return;
  }
  if (msg.type !== 'message' || !msg.to) return;
  if (!sock || !sock.user) {
    log('AVISO: WhatsApp ainda nao pareado, mensagem ignorada');
    return;
  }
  try {
    await sock.sendMessage(toJid(msg.to), { text: String(msg.content ?? '') });
    log(`enviado para ${msg.to}: ${String(msg.content).slice(0, 60)}`);
  } catch (err) {
    log('falha ao enviar para o WhatsApp:', err.message);
  }
}

// -------------------------------------------------------------- whatsapp ---

let sock = null;

/** "551199999999" -> "551199999999@s.whatsapp.net" */
function toJid(id) {
  const s = String(id);
  return s.includes('@') ? s : `${s}@s.whatsapp.net`;
}

/** "551199999999@s.whatsapp.net" -> "551199999999" */
function fromJid(jid) {
  return String(jid || '').split('@')[0];
}

/** Extrai texto de varios tipos de mensagem do WhatsApp. */
function extractText(msg) {
  if (!msg) return '';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return `[imagem] ${msg.imageMessage.caption}`;
  if (msg.videoMessage?.caption) return `[video] ${msg.videoMessage.caption}`;
  if (msg.documentMessage?.caption) return `[documento] ${msg.documentMessage.caption}`;
  if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  }
  if (msg.reactionMessage) return '[reacao]';
  return '';
}

function printQR(qr) {
  console.log('');
  console.log('=== ESCANEIE O QR CODE COM O WHATSAPP (Aparelhos conectados) ===');
  qrcode.generate(qr, { small: true });
  console.log('Se nao conseguir ler o QR no terminal, abra no celular/PC:');
  console.log(QR_IMAGE_URL + encodeURIComponent(qr));
  console.log('==============================================================');
  console.log('');
}

async function startWhatsApp() {
  if (CREDS_B64 && !fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    const n = unpackAuthDir(AUTH_DIR, CREDS_B64);
    log(`sessao restaurada de WA_CREDS_B64 (${n} arquivo(s))`);
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['picoclaw-bridge', 'Chrome', '120.0.0'],
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    try {
      const packed = packAuthDir(AUTH_DIR);
      fs.writeFileSync(path.join(__dirname, 'creds.b64'), packed);
      log(`sessao atualizada -> ${path.join(__dirname, 'creds.b64')} (${packed.length} bytes base64)`);
      log('para persistir em rede sem disco: copie esse arquivo para WA_CREDS_B64');
    } catch (err) {
      log('erro ao empacotar a sessao:', err.message);
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) printQR(qr);
    if (connection === 'open') log('WhatsApp conectado');
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      log(`WhatsApp desconectado (codigo ${statusCode || '?'})`);
      if (statusCode !== DisconnectReason.loggedOut) {
        log('reconectando em 5s...');
        setTimeout(() => startWhatsApp().catch((e) => log('erro ao reconectar:', e.message)), 5000);
      } else {
        log(' sessao deslogada: pare o bridge e paree de novo com o QR');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const chatJid = m.key.remoteJid || '';
      const isGroup = chatJid.endsWith('@g.us');
      const senderJid = isGroup ? (m.key.participant || chatJid) : chatJid;
      const content = extractText(m.message);
      if (!content) continue;
      const payload = {
        type: 'message',
        from: fromJid(senderJid),
        chat: fromJid(chatJid),
        content,
        media: [],
        id: m.key.id,
        from_name: m.pushName || '',
      };
      log(`recebido de ${payload.from}: ${content.slice(0, 60)}`);
      broadcast(payload);
    }
  });
}

// ------------------------------------------------------------ modo utils ---

/**
 * --inject <remetente> <mensagem>
 * Simula uma mensagem de entrada sem precisar parear o WhatsApp.
 * Serve para validar o lado do PicoClaw (e o agent) ponta a ponta.
 */
async function inject(from, text) {
  const payload = {
    type: 'message',
    from,
    chat: from,
    content: text,
    media: [],
    id: `inject-${Date.now()}`,
    from_name: 'inject',
  };
  log(`injetando mensagem de ${from}: ${text}`);
  broadcast(payload);
}

/** --pair: so parea (imprime o QR) e sai quando pareado. */
const PAIR_ONLY = process.argv.includes('--pair');
const INJECT_AT = process.argv.indexOf('--inject');

async function main() {
  if (INJECT_AT !== -1) {
    const from = process.argv[INJECT_AT + 1];
    const text = process.argv[INJECT_AT + 2] || 'teste';
    startServer();
    // Espera o PicoClaw (ou o fake-picoclaw) conectar e injeta a mensagem.
    const started = Date.now();
    while (clients.size === 0 && Date.now() - started < 60000) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (clients.size === 0) {
      log('nenhum cliente conectou em 60s');
      process.exit(1);
    }
    await inject(from, text);
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  log(`servidor websocket em ws://${HOST}:${PORT}`);
  log(`sessao whatsapp em ${AUTH_DIR}`);
  startServer();
  if (PAIR_ONLY) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const s = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['picoclaw-bridge', 'Chrome', '120.0.0'] });
    s.ev.on('creds.update', saveCreds);
    s.ev.on('connection.update', ({ connection, qr }) => {
      if (qr) printQR(qr);
      if (connection === 'open') {
        log('pareado com sucesso! copie a pasta de sessao/creds.b64 se precisar');
        process.exit(0);
      }
    });
    return;
  }

  await startWhatsApp();
}

main().catch((err) => {
  log('erro fatal:', err);
  process.exit(1);
});
