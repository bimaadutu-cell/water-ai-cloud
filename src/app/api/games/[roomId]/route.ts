import { NextRequest, NextResponse } from "next/server";
import { findRoomByPlayerToken } from "@/server/games/game-rooms";
import { tryMove as tryChessMove } from "@/server/games/chess-engine";
import { tryTttMove } from "@/server/games/tictactoe-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  }});
}
function tokenOf(req: NextRequest) { return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token") || ""; }
export async function OPTIONS() { return cors({ ok: true }); }
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const auth = findRoomByPlayerToken(roomId, tokenOf(req));
  if (!auth) return cors({ ok: false, error: "Room/token tidak valid" }, 401);
  const r = auth.room;
  return cors({ ok:true, roomId:r.id, kind:r.kind, status:r.status, side:auth.side, turn:r.turn, state:r.state, updatedAt:r.updatedAt });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const auth = findRoomByPlayerToken(roomId, tokenOf(req));
  if (!auth) return cors({ ok:false, error:"Room/token tidak valid" }, 401);
  const r=auth.room;
  if(r.status!=="active") return cors({ok:false,error:"Game belum aktif"},409);
  let body:any; try{body=await req.json()}catch{return cors({ok:false,error:"JSON tidak valid"},400)}
  if(r.kind==="chess"){
    const state:any=r.state; const expected=auth.side==="host"?"w":"b";
    if(state.turn!==expected) return cors({ok:false,error:"Bukan giliranmu",state},409);
    const result=tryChessMove(state,String(body?.from||"").toLowerCase(),String(body?.to||"").toLowerCase());
    if(!result.ok) return cors({ok:false,error:result.msg,state},422);
    r.state=result.state; r.turn=result.state.turn;
    if(["checkmate","stalemate","draw","resigned"].includes(result.state.status)) r.status="done";
    r.updatedAt=Date.now();
    return cors({ok:true,roomId:r.id,kind:r.kind,side:auth.side,turn:r.turn,state:r.state,status:r.status,updatedAt:r.updatedAt});
  }
  const state:any=r.state; const expected=auth.side==="host"?"X":"O";
  if(state.turn!==expected) return cors({ok:false,error:"Bukan giliranmu",state},409);
  const result=tryTttMove(state,Number(body?.cell));
  if(!result.ok) return cors({ok:false,error:result.msg,state},422);
  r.state=result.state; r.turn=result.state.turn;
  if(result.state.status!=="playing") r.status="done";
  r.updatedAt=Date.now();
  return cors({ok:true,roomId:r.id,kind:r.kind,side:auth.side,turn:r.turn,state:r.state,status:r.status,updatedAt:r.updatedAt});
}
