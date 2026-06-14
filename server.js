/**
 * FlipCollab – Serveur collaboratif
 * Compatible local (PC) ET Railway (serveur distant)
 * Zéro dépendance npm
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ── Config : PORT dynamique pour Railway ─────────────────────
const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// Railway injecte RAILWAY_PUBLIC_DOMAIN automatiquement
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const BASE_URL = PUBLIC_DOMAIN
  ? `https://${PUBLIC_DOMAIN}`
  : `http://${getLocalIP()}:${PORT}`;

// ── État en mémoire ───────────────────────────────────────────
const sessions = {};
const clients  = new Map();
const COLORS   = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7',
                  '#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];

// ── Serveur HTTP ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE_URL);

  if (url.pathname === '/') {
    serve(res, path.join(__dirname, 'public', 'flip.html'), 'text/html');
  } else if (url.pathname === '/join') {
    serve(res, path.join(__dirname, 'public', 'mobile.html'), 'text/html');
  } else if (url.pathname === '/qr.js') {
    serve(res, path.join(__dirname, 'public', 'qr.js'), 'application/javascript');
  } else if (url.pathname === '/api/session') {
    const sid = url.searchParams.get('id') || 'default';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      sessionId: sid,
      joinUrl:   `${BASE_URL}/join?session=${sid}`,
      baseUrl:   BASE_URL,
      strokes:   sessions[sid]?.strokes || [],
      users:     sessions[sid]?.users   || {},
    }));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

function serve(res, filePath, mime) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── WebSocket natif ───────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  const url      = new URL(req.url, BASE_URL);
  const sessionId = url.searchParams.get('session') || 'default';
  const userId    = url.searchParams.get('uid')     || Math.random().toString(36).slice(2, 8);
  const userName  = decodeURIComponent(url.searchParams.get('name') || 'Anonyme');

  // Handshake RFC 6455
  const key    = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  if (!sessions[sessionId]) sessions[sessionId] = { strokes: [], users: {} };
  const colorIdx  = Object.keys(sessions[sessionId].users).length % COLORS.length;
  const userColor = COLORS[colorIdx];
  sessions[sessionId].users[userId] = { name: userName, color: userColor };

  const ws = { socket, sessionId, userId, userName, userColor, buffer: Buffer.alloc(0) };
  clients.set(socket, ws);
  console.log(`[+] ${userName} rejoint ${sessionId}`);

  send(socket, { type:'init', userId, color:userColor, name:userName,
    strokes: sessions[sessionId].strokes, users: sessions[sessionId].users });
  broadcast(sessionId, socket, { type:'user_join', userId, name:userName,
    color:userColor, users: sessions[sessionId].users });

  socket.on('data', (data) => {
    ws.buffer = Buffer.concat([ws.buffer, data]);
    while (true) {
      const frame = decodeFrame(ws.buffer);
      if (!frame) break;
      ws.buffer = ws.buffer.slice(frame.consumed);
      if (frame.opcode === 8) { socket.destroy(); break; }
      if (frame.opcode === 1) handleMessage(socket, ws, frame.payload.toString());
    }
  });

  socket.on('close', () => {
    const info = clients.get(socket);
    if (info) {
      delete sessions[info.sessionId]?.users[info.userId];
      broadcast(info.sessionId, socket, { type:'user_leave', userId:info.userId,
        users: sessions[info.sessionId]?.users || {} });
      clients.delete(socket);
      console.log(`[-] ${info.userName} déconnecté`);
    }
  });
  socket.on('error', () => socket.destroy());
});

function handleMessage(socket, ws, raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  const { sessionId, userId } = ws;

  if (msg.type === 'stroke') {
    const stroke = { ...msg.data, userId, color: ws.userColor, name: ws.userName };
    sessions[sessionId].strokes.push(stroke);
    if (sessions[sessionId].strokes.length > 2000)
      sessions[sessionId].strokes = sessions[sessionId].strokes.slice(-2000);
    broadcast(sessionId, socket, { type:'stroke', stroke });
  } else if (msg.type === 'pointer') {
    broadcast(sessionId, socket, { type:'pointer', userId,
      color:ws.userColor, name:ws.userName, x:msg.x, y:msg.y });
  } else if (msg.type === 'clear') {
    sessions[sessionId].strokes = [];
    broadcastAll(sessionId, { type:'clear' });
  } else if (msg.type === 'undo') {
    const s = sessions[sessionId].strokes;
    for (let i = s.length-1; i >= 0; i--) {
      if (s[i].userId === userId) { s.splice(i, 1); break; }
    }
    broadcastAll(sessionId, { type:'redraw', strokes: sessions[sessionId].strokes });
  }
}

function send(socket, obj) {
  const buf   = Buffer.from(JSON.stringify(obj));
  const frame = encodeFrame(buf);
  try { socket.write(frame); } catch {}
}
function broadcast(sid, exclude, obj) {
  clients.forEach((ws, sock) => { if (ws.sessionId===sid && sock!==exclude) send(sock, obj); });
}
function broadcastAll(sid, obj) {
  clients.forEach((ws, sock) => { if (ws.sessionId===sid) send(sock, obj); });
}

function encodeFrame(buf) {
  const len = buf.length;
  let header;
  if (len < 126)       { header = Buffer.alloc(2); header[0]=0x81; header[1]=len; }
  else if (len < 65536){ header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(len,2); }
  else                 { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(len),2); }
  return Buffer.concat([header, buf]);
}
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked  = !!(buf[1] & 0x80);
  let len = buf[1] & 0x7f, offset = 2;
  if (len===126)      { if (buf.length<4)  return null; len=buf.readUInt16BE(2); offset=4; }
  else if (len===127) { if (buf.length<10) return null; len=Number(buf.readBigUInt64BE(2)); offset=10; }
  const total = offset + (masked?4:0) + len;
  if (buf.length < total) return null;
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset+4);
    payload = Buffer.alloc(len);
    for (let i=0; i<len; i++) payload[i] = buf[offset+4+i] ^ mask[i%4];
  } else { payload = buf.slice(offset, offset+len); }
  return { opcode, payload, consumed: total };
}

// ── Démarrage ─────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         FlipCollab – Serveur démarré            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  URL  ➜  ${BASE_URL.padEnd(41)}║`);
  console.log(`║  Join ➜  ${(BASE_URL+'/join?session=default').padEnd(41)}║`);
  console.log('╚══════════════════════════════════════════════════╝\n');
});
