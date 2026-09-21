/**
 * Online rooms for chess3 / ttt — bot-mediated real-time sync.
 * Host invites guest by phone; both get HTML updates after each move.
 */
export type GameKind = "chess" | "ttt";

export type GameRoom = {
  id: string;
  kind: GameKind;
  hostJid: string;
  guestJid?: string;
  hostPhone?: string;
  guestPhone?: string;
  hostToken: string;
  guestToken?: string;
  status: "waiting" | "active" | "done";
  // chess: fen-like simple board snapshot as JSON
  state: any;
  turn: "w" | "b" | "X" | "O";
  createdAt: number;
  updatedAt: number;
};

const rooms = new Map<string, GameRoom>();

function rid() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function token() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createRoom(kind: GameKind, hostJid: string, initialState: any): GameRoom {
  const id = rid();
  const room: GameRoom = {
    id,
    kind,
    hostJid,
    status: "waiting",
    state: initialState,
    hostToken: token(),
    turn: kind === "chess" ? "w" : "X",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): GameRoom | undefined {
  return rooms.get(id.toUpperCase());
}

export function listRoomsFor(jid: string): GameRoom[] {
  return [...rooms.values()].filter((r) => r.hostJid === jid || r.guestJid === jid);
}

/** Normalize Indonesian phone to WhatsApp JID */
export function phoneToJid(phone: string): string | null {
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("8") && p.length >= 9) p = "62" + p;
  if (!/^62\d{8,15}$/.test(p) && !/^\d{10,15}$/.test(p)) return null;
  return `${p}@s.whatsapp.net`;
}

export function inviteGuest(roomId: string, guestPhone: string): { ok: boolean; room?: GameRoom; error?: string; guestJid?: string } {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: "Room tidak ditemukan" };
  if (room.status === "done") return { ok: false, error: "Game sudah selesai" };
  const jid = phoneToJid(guestPhone);
  if (!jid) return { ok: false, error: "Nomor tidak valid. Contoh: 62812xxxxxxx atau 0812xxxxxxx" };
  room.guestJid = jid;
  room.guestPhone = guestPhone;
  room.guestToken = token();
  room.status = "waiting";
  room.updatedAt = Date.now();
  rooms.set(room.id, room);
  return { ok: true, room, guestJid: jid };
}

export function acceptRoom(roomId: string, guestJid: string): { ok: boolean; room?: GameRoom; error?: string } {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: "Room tidak ditemukan" };
  room.guestJid = guestJid;
  if (!room.guestToken) room.guestToken = token();
  room.status = "active";
  room.updatedAt = Date.now();
  rooms.set(room.id, room);
  return { ok: true, room };
}

export function updateRoomState(roomId: string, state: any, turn: GameRoom["turn"]): GameRoom | null {
  const room = getRoom(roomId);
  if (!room) return null;
  room.state = state;
  room.turn = turn;
  room.updatedAt = Date.now();
  rooms.set(room.id, room);
  return room;
}

export function endRoom(roomId: string) {
  const room = getRoom(roomId);
  if (room) {
    room.status = "done";
    room.updatedAt = Date.now();
  }
}


export function findRoomByPlayerToken(roomId: string, playerToken: string): { room: GameRoom; side: "host" | "guest" } | null {
  const room = getRoom(roomId);
  if (!room || !playerToken) return null;
  if (room.hostToken === playerToken) return { room, side: "host" };
  if (room.guestToken && room.guestToken === playerToken) return { room, side: "guest" };
  return null;
}

export function touchRoom(roomId: string) {
  const room = getRoom(roomId);
  if (!room) return null;
  room.updatedAt = Date.now();
  rooms.set(room.id, room);
  return room;
}
