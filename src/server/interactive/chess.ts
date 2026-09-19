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
  let sq = "";
  if (ctx.actionId.startsWith("CHESS_FROM_")) sq = ctx.actionId.slice("CHESS_FROM_".length);
  else if (ctx.actionId.includes(":")) sq = ctx.actionId.split(":")[1];
  sq = (sq || "").toLowerCase().replace(/[^a-h1-8]/g, "");
  if (!/^[a-h][1-8]$/.test(sq)) return { text: "Kotak tidak valid." };
  return {
    text: `Memilih ${sq}...`,
    // @ts-ignore
    _chessCmd: sq,
  };
}

async function handleToMove(ctx: InteractiveContext, session: InteractiveSession) {
  // Supports CHESS_TO_e4 and CHESS_TO:e4
  let dest = "";
  if (ctx.actionId.startsWith("CHESS_TO_")) dest = ctx.actionId.slice("CHESS_TO_".length);
  else if (ctx.actionId.includes(":")) dest = ctx.actionId.split(":")[1];
  dest = (dest || "").toLowerCase().replace(/[^a-h1-8]/g, "");
  if (!/^[a-h][1-8]$/.test(dest)) return { text: "Gerak tidak valid." };
  return {
    text: `♟️ Mencoba ke *${dest}*...`,
    // @ts-ignore — engine re-routes to chess2 with destination square
    _chessCmd: dest,
  };
}

registerExactHandler(CHESS_IDS.new, handleChessNew);
registerExactHandler(CHESS_IDS.resign, handleChessResign);
registerExactHandler(CHESS_IDS.reset, handleChessNew);
registerExactHandler("CHESS_UNDO", handleChessUndo);
registerExactHandler("CHESS_SELECT_FROM_START", handleSelectFromStart);
registerExactHandler("CHESS_FROM:", handleFromSquare);
registerExactHandler("CHESS_FROM_", handleFromSquare);
registerExactHandler("CHESS_TO:", handleToMove);
registerExactHandler("CHESS_TO_", handleToMove);
