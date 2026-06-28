/* ws.js — Sorcery room-based relay (2 players per room)
 *
 * Host flow:
 *   -> {t:'room:create'}  => {t:'room:created', room:'ABCDE'}
 * Join flow:
 *   -> {t:'room:join', room:'ABCDE'} => {t:'room:joined', room:'ABCDE'}
 *
 * Then both peers can exchange:
 *   setup, match:start, game:sync, intent, modal:req, modal:res, etc.
 * Server simply relays peer messages inside the room.
 */

const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;

const app = express();

app.get("/", (req, res) => res.status(200).send("Sorcery WS relay: ok"));
app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// IMPORTANT: catch-all so /abc, /anything never falls back to Apache 404/ErrorDocument
app.use((req, res) => {
  res.status(200).send(`Sorcery WS relay: ok (${req.method} ${req.url})`);
});

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  console.log("[upgrade]", req.headers.host, req.headers.origin, req.url);
});

const wss = new WebSocketServer({ server });
/** @type {Map<string, { host?: any, join?: any }>} */
const rooms = new Map();

function genRoomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function createUniqueRoom() {
  for (let i = 0; i < 50; i++) {
    const code = genRoomCode(6);
    if (!rooms.has(code)) {
      rooms.set(code, {});
      return code;
    }
  }
  // Very unlikely unless you have a huge number of active rooms.
  const fallback = `${Date.now().toString(36).toUpperCase()}`;
  rooms.set(fallback, {});
  return fallback;
}

function safeSend(ws, obj) {
  try {
    // ws library: OPEN === 1
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {}
}

function sendErr(ws, code, message) {
  safeSend(ws, { t: "err", e: code, message });
}

function parseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function findRoomOfSocket(ws) {
  for (const [room, r] of rooms.entries()) {
    if (r.host === ws || r.join === ws) return room;
  }
  return null;
}

function otherPeer(room, ws) {
  const r = rooms.get(room);
  if (!r) return null;
  if (r.host === ws) return r.join || null;
  if (r.join === ws) return r.host || null;
  return null;
}

function cleanupRoomIfEmpty(room) {
  const r = rooms.get(room);
  if (!r) return;
  const hostAlive = r.host && r.host.readyState === 1;
  const joinAlive = r.join && r.join.readyState === 1;
  if (!hostAlive) r.host = undefined;
  if (!joinAlive) r.join = undefined;
  if (!r.host && !r.join) rooms.delete(room);
}

wss.on("connection", (ws, req) => {
  try {
    console.log('[ws] connected', req?.headers?.origin, req?.url);
  } catch {}

  // Basic heartbeat (optional but useful on hosting platforms)
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  safeSend(ws, { t: "hello", version: 1 });

  ws.on("message", (data) => {
    const msg = parseJson(String(data));
    if (!msg || typeof msg !== "object") {
      sendErr(ws, "invalid_json", "Invalid JSON message.");
      return;
    }

    const t = msg.t;

    if (t === "ping") {
      safeSend(ws, { t: "pong" });
      return;
    }

    // Host creates a room
    if (t === "room:create") {
      const room = createUniqueRoom();
      const r = rooms.get(room);
      r.host = ws;
      safeSend(ws, { t: "room:created", room, seat: "host" });
      return;
    }

    // Join a room
    if (t === "room:join") {
      const room = String(msg.room || "").trim().toUpperCase();
      const r = rooms.get(room);

      if (!room || !r) {
        sendErr(ws, "room_not_found", "Room not found.");
        return;
      }
      if (r.join && r.join.readyState === 1) {
        sendErr(ws, "room_full", "Room is full.");
        return;
      }

      r.join = ws;
      safeSend(ws, { t: "room:joined", room, seat: "join", peers: 2 });

      // Notify host that peer connected
      safeSend(r.host, { t: "peer:joined", room });
      safeSend(ws, { t: "peer:joined", room });
      return;
    }

    // Relay other messages peer-to-peer within the room
    const room = findRoomOfSocket(ws);
    if (!room) {
      sendErr(ws, "not_in_room", "Not in a room yet.");
      return;
    }

    const peer = otherPeer(room, ws);
    if (!peer) {
      // No peer yet; ignore relays (host can still send setup, etc., but it won't go anywhere)
      return;
    }

    // Tag room so client can ignore mismatched rooms if needed
    const relay = { ...msg, room };
    safeSend(peer, relay);
  });

  ws.on("close", () => {
    const room = findRoomOfSocket(ws);
    if (!room) return;
    const peer = otherPeer(room, ws);
    safeSend(peer, { t: "peer:left", room });
    cleanupRoomIfEmpty(room);
  });

  ws.on("error", () => {
    const room = findRoomOfSocket(ws);
    if (!room) return;
    const peer = otherPeer(room, ws);
    safeSend(peer, { t: "peer:left", room });
    cleanupRoomIfEmpty(room);
  });
});

// Heartbeat interval to terminate dead connections (optional)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

// Passenger will set PORT; we bind to 0.0.0.0 to be safe.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[sorcery-ws] listening on ${PORT}`);
});
