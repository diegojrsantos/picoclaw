'use strict';

/**
 * Cliente de teste que fala EXATAMENTE o mesmo protocolo do PicoClaw no canal
 * WhatsApp (modo bridge). Serve para validar o bridge sem parear o WhatsApp
 * e sem subir o PicoClaw.
 *
 *   node fake-picoclaw.js
 *
 * Ele conecta no WebSocket, mostra o que chega e responde "pong" em tudo.
 */

const WebSocket = require('ws');

const URL = process.env.BRIDGE_URL || 'ws://127.0.0.1:3001';

const ws = new WebSocket(URL);

ws.on('open', () => {
  console.log('[fake-picoclaw] conectado em', URL);
  // mesma mensagem que o PicoClaw envia ao responder (pkg/channels/whatsapp)
  ws.send(JSON.stringify({ type: 'message', to: '551199999999', content: 'pong do fake-picoclaw' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log('[fake-picoclaw] recebeu:', JSON.stringify(msg));
});

ws.on('close', () => console.log('[fake-picoclaw] desconectado'));
ws.on('error', (err) => console.log('[fake-picoclaw] erro:', err.message));
