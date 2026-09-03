/**
 * Chess interactive handlers — button IDs match the video-style UI
 */
import { createSession, getSession, updateSession, deleteSession } from "./session";
import { registerExactHandler, type InteractiveContext } from "./router";
import { CHESS_IDS } from "./helpers";
import type { InteractiveSession } from "./session";

export interface ChessInteractiveState {
  mode: "idle" | "select_from" | "select_to";
  turn: "w" | "b";
  selectedFrom?: string;
  legalTargets?: string[];
  isAi: boolean;
  moveHistory: string[];
}

export function getChessSession(botId: string, jid: string) {
  return getSession(botId, jid, "chess");
}

export function createChessSession(
  botId: string,
  jid: string,
  opts: { isAi?: boolean; whitePlayer?: string } = {}
) {
  const state: ChessInteractiveState = {
    mode: "idle",
    turn: "w",
    isAi: opts.isAi ?? true,
    moveHistory: [],
  };
  return createSession(botId, jid, "chess", state as any, 30 * 60 * 1000);
}

async function handleChessNew(ctx: InteractiveContext, _session: InteractiveSession) {
  // Signal engine to run .chess2 new via special marker
  return {
    text: "🆕 Membuka game baru...",
    // @ts-ignore
    _chessCmd: "new",
  };
}

async function handleChessResign(ctx: InteractiveContext, _session: InteractiveSession) {
  return {
    text: "🏳️ Membatalkan game...",
    // @ts-ignore
    _chessCmd: "resign",
  };
}

async function handleChessUndo(ctx: InteractiveContext, _session: InteractiveSession) {
  return {
    text: "↩ Membatalkan langkah...",
    // @ts-ignore
    _chessCmd: "undo",
  };
}

async function handleSelectFromStart(ctx: InteractiveContext, session: InteractiveSession) {
  updateSession(ctx.botId, ctx.jid, "chess", { mode: "select_from" });
  return {
    text:
      "♟ *Pilih kotak asal (bidak putih)*\n\n" +
      "Ketik misalnya: `e2` / `d2` / `g1`\n" +
      "Atau gerak lengkap: `.chess2 e2e4`",
    buttons: [
      { id: "CHESS_FROM:e2", text: "e2" },
      { id: "CHESS_FROM:d2", text: "d2" },
      { id: "CHESS_FROM:g1", text: "g1" },
    ],
  };
}

async function handleFromSquare(ctx: InteractiveContext, session: InteractiveSession) {
  const sq = ctx.actionId.includes(":") ? ctx.actionId.split(":")[1] : "";
  if (!sq) return { text: "Kotak tidak valid." };
  // Re-route as chess2 single-square select
  return {
    text: `Memilih ${sq}...`,
    // @ts-ignore
    _chessCmd: sq,
  };
}

async function handleToMove(ctx: InteractiveContext, session: InteractiveSession) {
  const move = ctx.actionId.includes(":") ? ctx.actionId.split(":")[1] : "";
  if (!move) return { text: "Gerak tidak valid." };
  return {
    text: `♟️ Mencoba gerak *${move}*...`,
    // @ts-ignore
    _chessCmd: move,
  };
}

registerExactHandler(CHESS_IDS.new, handleChessNew);
registerExactHandler(CHESS_IDS.resign, handleChessResign);
registerExactHandler(CHESS_IDS.reset, handleChessNew);
registerExactHandler("CHESS_UNDO", handleChessUndo);
registerExactHandler("CHESS_SELECT_FROM_START", handleSelectFromStart);
registerExactHandler("CHESS_FROM:", handleFromSquare);
registerExactHandler("CHESS_TO:", handleToMove);
