export interface Env {
  LOBBY: DurableObjectNamespace;
  IDENTITY: DurableObjectNamespace;
}

type Role = 'host' | 'join' | 'spectator';
type SocketMeta = { room: string | null; role: Role | null; chatRoom: string | null };
type RoomSeatMeta = { avatarName: string; handle?: string; userId?: string };
type RoomState = {
  host?: WebSocket;
  join?: WebSocket;
  spectators: Set<WebSocket>;
  chat: Set<WebSocket>;
  inGame: boolean;
  startedAt: number | null;
  updatedAt: number;
  hostMeta: RoomSeatMeta | null;
  joinMeta: RoomSeatMeta | null;
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const SERVER_SAVE_ID_ADJECTIVES = [
  'ARCANE', 'EMBER', 'FROST', 'GOLDEN', 'IVORY', 'JASPER', 'LUNAR', 'MOSSY',
  'NOBLE', 'ONYX', 'RUNE', 'SOLAR', 'TEMPEST', 'UMBER', 'VERDANT', 'WILD',
] as const;

const SERVER_SAVE_ID_NOUNS = [
  'ATLAS', 'BASTION', 'CIPHER', 'DRUID', 'EMBER', 'FALCON', 'GATE', 'HARBOR',
  'KEEP', 'LANTERN', 'MONOLITH', 'NEXUS', 'ORBIT', 'PHOENIX', 'QUARRY', 'SPIRE',
] as const;

const SERVER_SAVE_RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_ID_PATTERN = /^[A-Z0-9-]{8,40}$/;
const RECOVERY_KEY_PATTERN = /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlayerId(input: unknown): string {
  return String(input ?? '').trim().toUpperCase();
}

function normalizeRecoveryKey(input: unknown): string {
  return String(input ?? '').trim().toUpperCase();
}

function secureRandomInt(maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) return 0;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return Number(bytes[0] % maxExclusive);
}

function generateServerSavePlayerId(): string {
  const adjective = SERVER_SAVE_ID_ADJECTIVES[secureRandomInt(SERVER_SAVE_ID_ADJECTIVES.length)] ?? 'ARCANE';
  const noun = SERVER_SAVE_ID_NOUNS[secureRandomInt(SERVER_SAVE_ID_NOUNS.length)] ?? 'ATLAS';
  const digits = String(1000 + secureRandomInt(9000));
  return `${adjective}-${noun}-${digits}`;
}

function generateServerSaveRecoveryKey(): string {
  const parts: string[] = [];
  for (let group = 0; group < 4; group += 1) {
    let chunk = '';
    for (let i = 0; i < 4; i += 1) {
      chunk += SERVER_SAVE_RECOVERY_ALPHABET[secureRandomInt(SERVER_SAVE_RECOVERY_ALPHABET.length)] ?? 'A';
    }
    parts.push(chunk);
  }
  return parts.join('-');
}

async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const data = new TextEncoder().encode(recoveryKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!ws) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // Ignore transient socket errors.
  }
}

function makeRoomCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname === '/id' || url.pathname.startsWith('/id/')) {
      const id = env.IDENTITY.idFromName('global');
      const stub = env.IDENTITY.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/rooms') {
      const id = env.LOBBY.idFromName('global');
      const stub = env.LOBBY.get(id);
      return stub.fetch(request);
    }

    if (url.pathname !== '/ws') {
      return new Response('drawaspell ws worker: ok', { status: 200 });
    }

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const id = env.LOBBY.idFromName('global');
    const stub = env.LOBBY.get(id);
    return stub.fetch(request);
  },
};

export class IdentityDO {
  private readonly sql: SqlStorage;
  private schemaReady = false;

  constructor(private readonly state: DurableObjectState, _env: Env) {
    this.sql = state.storage.sql;
  }

  private ensureSchema() {
    if (this.schemaReady) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS player_identities (
        player_id TEXT PRIMARY KEY,
        recovery_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.schemaReady = true;
  }

  private async readJson(request: Request): Promise<Record<string, unknown>> {
    try {
      const parsed = await request.json();
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private readIdentity(playerId: string) {
    this.ensureSchema();
    const rows = this.sql.exec(
      `SELECT player_id AS playerId, recovery_hash AS recoveryHash, created_at AS createdAt
       FROM player_identities
       WHERE player_id = ?
       LIMIT 1`,
      playerId,
    ).toArray() as Array<{ playerId: string; recoveryHash: string; createdAt: number }>;
    return rows[0] ?? null;
  }

  private async createIdentityRecord() {
    this.ensureSchema();
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const playerId = generateServerSavePlayerId();
      const exists = this.sql.exec(
        'SELECT 1 AS ok FROM player_identities WHERE player_id = ? LIMIT 1',
        playerId,
      ).toArray();
      if (exists.length > 0) continue;
      const recoveryKey = generateServerSaveRecoveryKey();
      const recoveryHash = await hashRecoveryKey(recoveryKey);
      const now = Date.now();
      this.sql.exec(
        `INSERT INTO player_identities (player_id, recovery_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        playerId,
        recoveryHash,
        now,
        now,
      );
      return { playerId, recoveryKey, createdAt: now };
    }
    return null;
  }

  private async verifyIdentity(playerId: string, recoveryKey: string) {
    const identity = this.readIdentity(playerId);
    if (!identity) return null;
    const recoveryHash = await hashRecoveryKey(recoveryKey);
    if (identity.recoveryHash !== recoveryHash) return null;
    return identity;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    if (url.pathname === '/health' || url.pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }

    if (url.pathname === '/id/create') {
      const created = await this.createIdentityRecord();
      if (!created) {
        return jsonResponse({ ok: false, error: 'id_generation_failed' }, 500);
      }
      return jsonResponse({
        ok: true,
        backend: 'cloudflare-do',
        playerId: created.playerId,
        recoveryKey: created.recoveryKey,
        createdAt: created.createdAt,
      });
    }

    if (url.pathname === '/id/verify') {
      const body = await this.readJson(request);
      const playerId = normalizePlayerId(body.playerId);
      const recoveryKey = normalizeRecoveryKey(body.recoveryKey);
      if (!PLAYER_ID_PATTERN.test(playerId) || !RECOVERY_KEY_PATTERN.test(recoveryKey)) {
        return jsonResponse({ ok: false, error: 'invalid_format' }, 400);
      }
      const verified = await this.verifyIdentity(playerId, recoveryKey);
      if (!verified) {
        return jsonResponse({ ok: false, error: 'invalid_credentials' }, 401);
      }
      return jsonResponse({
        ok: true,
        backend: 'cloudflare-do',
        playerId: verified.playerId,
        createdAt: toInt(verified.createdAt, Date.now()),
      });
    }

    if (url.pathname === '/id/rotate') {
      const body = await this.readJson(request);
      const playerId = normalizePlayerId(body.playerId);
      const recoveryKey = normalizeRecoveryKey(body.recoveryKey);
      if (!PLAYER_ID_PATTERN.test(playerId) || !RECOVERY_KEY_PATTERN.test(recoveryKey)) {
        return jsonResponse({ ok: false, error: 'invalid_format' }, 400);
      }
      const verified = await this.verifyIdentity(playerId, recoveryKey);
      if (!verified) {
        return jsonResponse({ ok: false, error: 'invalid_credentials' }, 401);
      }
      const nextRecoveryKey = generateServerSaveRecoveryKey();
      const nextRecoveryHash = await hashRecoveryKey(nextRecoveryKey);
      const rotatedAt = Date.now();
      this.ensureSchema();
      this.sql.exec(
        `UPDATE player_identities
         SET recovery_hash = ?, updated_at = ?
         WHERE player_id = ?`,
        nextRecoveryHash,
        rotatedAt,
        playerId,
      );
      return jsonResponse({
        ok: true,
        backend: 'cloudflare-do',
        playerId,
        recoveryKey: nextRecoveryKey,
        createdAt: toInt(verified.createdAt, rotatedAt),
        rotatedAt,
      });
    }

    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }
}

export class LobbyDO {
  private readonly rooms = new Map<string, RoomState>();
  private readonly meta = new Map<WebSocket, SocketMeta>();

  constructor(_state: DurableObjectState, _env: Env) {}

  private liveRoomsPayload() {
    const rooms = Array.from(this.rooms.entries())
      .filter(([, room]) => room.inGame && !!room.host && !!room.join)
      .map(([roomCode, room]) => ({
        room: roomCode,
        spectators: room.spectators.size,
        startedAt: room.startedAt,
        updatedAt: room.updatedAt,
        host: room.hostMeta,
        join: room.joinMeta,
      }))
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return { ok: true, rooms, ts: Date.now() };
  }

  private extractSetupMeta(msg: any): RoomSeatMeta | null {
    const setup = msg?.setup;
    if (!setup || typeof setup !== 'object') return null;
    const avatarName = String((setup as any).avatarName ?? '').trim();
    if (!avatarName) return null;
    const handleRaw = String((setup as any).handle ?? '').trim();
    const userIdRaw = String((setup as any).userId ?? '').trim();
    return {
      avatarName,
      handle: handleRaw ? handleRaw.slice(0, 24) : undefined,
      userId: userIdRaw ? userIdRaw.slice(0, 64) : undefined,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (url.pathname === '/rooms') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
      }
      return jsonResponse(this.liveRoomsPayload());
    }

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.meta.set(server, { room: null, role: null, chatRoom: null });
    jsonSend(server, { t: 'hello', version: 1 });

    server.addEventListener('message', (evt) => {
      this.onMessage(server, evt);
    });
    server.addEventListener('close', () => {
      this.onDisconnect(server);
    });
    server.addEventListener('error', () => {
      this.onDisconnect(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private sendErr(ws: WebSocket, code: string, message: string) {
    jsonSend(ws, { t: 'err', e: code, message });
  }

  private allocRoom(): string | null {
    for (let i = 0; i < 1000; i++) {
      const code = makeRoomCode(6);
      if (!this.rooms.has(code)) {
        this.rooms.set(code, {
          spectators: new Set<WebSocket>(),
          chat: new Set<WebSocket>(),
          inGame: false,
          startedAt: null,
          updatedAt: Date.now(),
          hostMeta: null,
          joinMeta: null,
        });
        return code;
      }
    }
    return null;
  }

  private normalizeRoomCode(input: unknown): string {
    return String(input ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private ensureRoom(code: string): RoomState {
    let room = this.rooms.get(code);
    if (!room) {
      room = {
        spectators: new Set<WebSocket>(),
        chat: new Set<WebSocket>(),
        inGame: false,
        startedAt: null,
        updatedAt: Date.now(),
        hostMeta: null,
        joinMeta: null,
      };
      this.rooms.set(code, room);
    }
    if (!room.spectators) room.spectators = new Set<WebSocket>();
    if (!room.chat) room.chat = new Set<WebSocket>();
    if (typeof room.inGame !== 'boolean') room.inGame = false;
    if (room.startedAt === undefined) room.startedAt = null;
    if (room.updatedAt === undefined) room.updatedAt = Date.now();
    if (room.hostMeta === undefined) room.hostMeta = null;
    if (room.joinMeta === undefined) room.joinMeta = null;
    return room;
  }

  private roomMembers(room: RoomState): WebSocket[] {
    const out = new Set<WebSocket>();
    if (room.host) out.add(room.host);
    if (room.join) out.add(room.join);
    for (const ws of room.spectators) out.add(ws);
    for (const ws of room.chat) out.add(ws);
    return Array.from(out);
  }

  private broadcastRoom(room: RoomState, payload: unknown) {
    for (const socket of this.roomMembers(room)) jsonSend(socket, payload);
  }

  private broadcastChatPresence(roomCode: string, room: RoomState) {
    this.broadcastRoom(room, { t: 'chat:presence', room: roomCode, peers: room.chat.size });
  }

  private clearRoomMembership(ws: WebSocket) {
    const sender = this.meta.get(ws);
    if (!sender) return;
    if (sender.room) {
      const room = this.rooms.get(sender.room);
      if (room) {
        if (sender.role === 'host' && room.host === ws) {
          room.host = undefined;
          room.hostMeta = null;
          room.inGame = false;
          room.startedAt = null;
          room.updatedAt = Date.now();
        }
        if (sender.role === 'join' && room.join === ws) {
          room.join = undefined;
          room.joinMeta = null;
          room.inGame = false;
          room.startedAt = null;
          room.updatedAt = Date.now();
        }
        if (sender.role === 'spectator') {
          room.spectators.delete(ws);
          room.updatedAt = Date.now();
          jsonSend(room.host, {
            t: 'spectator:left',
            room: sender.room,
            spectators: room.spectators.size,
          });
        } else {
          const peer = this.getPeer(room, sender.role);
          jsonSend(peer, { t: 'peer:left', room: sender.room });
          if (sender.role === 'host') {
            for (const viewer of room.spectators) {
              jsonSend(viewer, { t: 'peer:left', room: sender.room });
            }
          }
        }
        if (!room.host && !room.join && room.spectators.size === 0 && room.chat.size === 0) {
          this.rooms.delete(sender.room);
        }
      }
    }
    if (sender.chatRoom) {
      const room = this.rooms.get(sender.chatRoom);
      if (room) {
        room.chat.delete(ws);
        this.broadcastChatPresence(sender.chatRoom, room);
        if (!room.host && !room.join && room.spectators.size === 0 && room.chat.size === 0) {
          this.rooms.delete(sender.chatRoom);
        }
      }
    }
    this.meta.set(ws, { room: null, role: null, chatRoom: null });
  }

  private getPeer(room: RoomState | undefined, role: Role | null): WebSocket | undefined {
    if (!room || !role) return undefined;
    if (role === 'host') return room.join;
    if (role === 'join') return room.host;
    return undefined;
  }

  private onMessage(ws: WebSocket, evt: MessageEvent) {
    let msg: any;
    try {
      msg = JSON.parse(String(evt.data));
    } catch {
      this.sendErr(ws, 'invalid_json', 'Invalid JSON message.');
      return;
    }

    if (!msg || typeof msg !== 'object') {
      this.sendErr(ws, 'invalid_message', 'Invalid message payload.');
      return;
    }

    const t = String(msg.t || '');

    if (t === 'ping') {
      jsonSend(ws, { t: 'pong' });
      return;
    }

    if (t === 'room:create') {
      const requestedRoom = this.normalizeRoomCode(msg.room);
      let roomCode = requestedRoom;
      if (!roomCode) {
        const allocated = this.allocRoom();
        if (!allocated) {
          this.sendErr(ws, 'room_alloc_failed', 'Unable to allocate room code.');
          return;
        }
        roomCode = allocated;
      }
      if (roomCode.length < 4 || roomCode.length > 12) {
        this.sendErr(ws, 'invalid_room', 'Room code must be 4-12 letters/numbers.');
        return;
      }
      const room = this.ensureRoom(roomCode);
      if (room.host && room.host !== ws) {
        this.sendErr(ws, 'room_taken', 'That room code is already hosted.');
        return;
      }
      const prev = this.meta.get(ws) ?? { room: null, role: null, chatRoom: null };
      if (prev.room && (prev.role === 'host' || prev.role === 'join' || prev.role === 'spectator')) {
        this.clearRoomMembership(ws);
      }
      room.host = ws;
      room.inGame = false;
      room.startedAt = null;
      room.updatedAt = Date.now();
      room.hostMeta = null;
      room.joinMeta = null;
      this.meta.set(ws, { room: roomCode, role: 'host', chatRoom: null });
      jsonSend(ws, { t: 'room:created', room: roomCode, seat: 'host' });
      if (room.join && room.join !== ws) {
        jsonSend(room.join, { t: 'peer:joined', room: roomCode });
        jsonSend(ws, { t: 'peer:joined', room: roomCode });
      }
      return;
    }

    if (t === 'room:join') {
      const roomCode = this.normalizeRoomCode(msg.room);
      const room = this.rooms.get(roomCode);

      if (!roomCode || !room) {
        this.sendErr(ws, 'room_not_found', 'Room not found.');
        return;
      }
      if (!room.host) {
        this.sendErr(ws, 'room_not_hosted', 'Host has not joined this room yet.');
        return;
      }
      if (room.join && room.join !== ws) {
        this.sendErr(ws, 'room_full', 'Room is full.');
        return;
      }

      const prev = this.meta.get(ws) ?? { room: null, role: null, chatRoom: null };
      if (prev.room && (prev.role === 'host' || prev.role === 'join' || prev.role === 'spectator')) {
        this.clearRoomMembership(ws);
      }

      room.join = ws;
      room.inGame = false;
      room.startedAt = null;
      room.updatedAt = Date.now();
      room.joinMeta = null;
      this.meta.set(ws, { room: roomCode, role: 'join', chatRoom: null });
      jsonSend(ws, { t: 'room:joined', room: roomCode, seat: 'join', peers: 2 });

      jsonSend(room.host, { t: 'peer:joined', room: roomCode });
      jsonSend(ws, { t: 'peer:joined', room: roomCode });
      return;
    }

    if (t === 'room:spectate') {
      const roomCode = this.normalizeRoomCode(msg.room);
      const room = this.rooms.get(roomCode);
      if (!roomCode || !room) {
        this.sendErr(ws, 'room_not_found', 'Room not found.');
        return;
      }
      if (!room.host) {
        this.sendErr(ws, 'room_not_hosted', 'Host has not joined this room yet.');
        return;
      }

      const prev = this.meta.get(ws) ?? { room: null, role: null, chatRoom: null };
      if (prev.room && (prev.role === 'host' || prev.role === 'join' || prev.role === 'spectator')) {
        this.clearRoomMembership(ws);
      }

      room.spectators.add(ws);
      room.updatedAt = Date.now();
      this.meta.set(ws, { room: roomCode, role: 'spectator', chatRoom: null });
      jsonSend(ws, {
        t: 'room:spectating',
        room: roomCode,
        seat: 'spectator',
        peers: 2 + room.spectators.size,
      });
      jsonSend(room.host, { t: 'spectator:joined', room: roomCode, spectators: room.spectators.size });
      return;
    }

    if (t === 'chat:join') {
      const roomCode = this.normalizeRoomCode(msg.room);
      if (!roomCode) {
        this.sendErr(ws, 'invalid_room', 'Room code required.');
        return;
      }
      const prev = this.meta.get(ws) ?? { room: null, role: null, chatRoom: null };
      if (prev.chatRoom && prev.chatRoom !== roomCode) {
        const oldRoom = this.rooms.get(prev.chatRoom);
        if (oldRoom) {
          oldRoom.chat.delete(ws);
          this.broadcastChatPresence(prev.chatRoom, oldRoom);
          if (!oldRoom.host && !oldRoom.join && oldRoom.spectators.size === 0 && oldRoom.chat.size === 0) {
            this.rooms.delete(prev.chatRoom);
          }
        }
      }
      const room = this.ensureRoom(roomCode);
      room.chat.add(ws);
      this.meta.set(ws, { room: prev.room, role: prev.role, chatRoom: roomCode });
      jsonSend(ws, { t: 'chat:joined', room: roomCode, peers: room.chat.size });
      this.broadcastChatPresence(roomCode, room);
      return;
    }

    if (t === 'chat:msg') {
      const senderMeta = this.meta.get(ws);
      const roomCode = this.normalizeRoomCode(msg.room || senderMeta?.chatRoom || senderMeta?.room);
      const room = this.rooms.get(roomCode);
      if (!roomCode || !room) {
        this.sendErr(ws, 'room_not_found', 'Room not found.');
        return;
      }
      const inRoom = room.chat.has(ws) || room.host === ws || room.join === ws || room.spectators.has(ws);
      if (!inRoom) {
        this.sendErr(ws, 'not_in_room', 'Join chat before sending messages.');
        return;
      }
      const text = String(msg.text ?? '').trim();
      if (!text) return;
      const handle = String(msg.handle ?? 'Player').trim().slice(0, 24) || 'Player';
      const userId = String(msg.userId ?? '').trim() || undefined;
      const ts = Number(msg.ts);
      const payload = {
        t: 'chat:msg',
        room: roomCode,
        handle,
        userId,
        text: text.slice(0, 600),
        ts: Number.isFinite(ts) ? ts : Date.now(),
      };
      this.broadcastRoom(room, payload);
      return;
    }

    const sender = this.meta.get(ws);
    if (!sender?.room || !sender.role) {
      this.sendErr(ws, 'not_in_room', 'Not in a room yet.');
      return;
    }

    const room = this.rooms.get(sender.room);
    if (room && t === 'setup' && (sender.role === 'host' || sender.role === 'join')) {
      const meta = this.extractSetupMeta(msg);
      if (meta) {
        if (sender.role === 'host') room.hostMeta = meta;
        else room.joinMeta = meta;
        room.updatedAt = Date.now();
      }
    }
    if (room && t === 'match:start' && sender.role === 'host') {
      room.inGame = true;
      room.startedAt = Date.now();
      room.updatedAt = room.startedAt;
    }

    if (sender.role === 'host' && (t === 'spectator:start' || t === 'spectator:sync')) {
      if (!room) return;
      for (const viewer of room.spectators) jsonSend(viewer, { ...msg, room: sender.room });
      return;
    }

    if (sender.role === 'spectator') {
      this.sendErr(ws, 'read_only', 'Spectators are read-only.');
      return;
    }

    const peer = this.getPeer(room, sender.role);
    if (!peer) {
      // Match host behavior from existing relay: silently ignore before peer joins.
      return;
    }

    jsonSend(peer, { ...msg, room: sender.room });
  }

  private onDisconnect(ws: WebSocket) {
    if (!this.meta.has(ws)) return;
    this.clearRoomMembership(ws);
    this.meta.delete(ws);
  }
}
