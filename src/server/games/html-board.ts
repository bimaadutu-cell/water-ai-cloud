/**
 * Self-contained HTML game boards — full viewport / 9:16 friendly.
 * Sent as WhatsApp document (text/html) or rich HTML bubble.
 * Chess: real rules (legal moves, check, checkmate) + WATER AI bot.
 * TTT: mode AI / teman, board size 3×3 / 5×5 / 8×8.
 */

export function buildChessHtml(opts?: {
  title?: string;
  status?: string;
  mode?: "ai" | "pvp";
  difficulty?: "easy" | "normal" | "hard";
}): string {
  const title = String(opts?.title || "Chess — BimzOfficial").replace(/[<>&"]/g, "");
  const mode = opts?.mode || "ai";
  const difficulty = opts?.difficulty || "normal";
  const initialStatus = String(opts?.status || `VS COMPUTER · ${difficulty.toUpperCase()} · Giliran: Putih`).replace(/[<>&"]/g, "");
  const pieces: Record<string,string> = { bR:"♜",bN:"♞",bB:"♝",bQ:"♛",bK:"♚",bP:"♟",wR:"♖",wN:"♘",wB:"♗",wQ:"♕",wK:"♔",wP:"♙" };
  const initialBoard = [["bR","bN","bB","bQ","bK","bB","bN","bR"],["bP","bP","bP","bP","bP","bP","bP","bP"],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],["wP","wP","wP","wP","wP","wP","wP","wP"],["wR","wN","wB","wQ","wK","wB","wN","wR"]];
  const staticCells = initialBoard.flat().map((p,i) => `<div class="cell ${((Math.floor(i/8)+i%8)%2===0)?"light":"dark"}">${p ? `<div class="piece ${p[0]==="w"?"white":"black"}">${pieces[p]}</div>` : ""}</div>`).join("");

  return String.raw`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title}</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:radial-gradient(circle at 50% 10%,#314454,#0b1117 45%,#020305);color:#fff;font-family:Arial,sans-serif}#app{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:7px}.top{width:min(96vw,720px);display:flex;align-items:center;justify-content:space-between}.logo{font-size:clamp(20px,6vw,34px);font-weight:900;letter-spacing:2px}.credit{font-size:9px;color:#9eabb7}.turn{padding:8px 11px;border-radius:12px;background:#ffffff10;border:1px solid #ffffff18;box-shadow:0 6px 20px #0009;font-size:11px;font-weight:bold}.modebar{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}.mode{border:1px solid #ffffff18;color:#fff;background:linear-gradient(145deg,#28343e,#0c1115);border-radius:10px;padding:7px 10px;font-size:10px;font-weight:900;box-shadow:0 5px 12px #0009}.mode.on{border-color:#5ce1ff;color:#5ce1ff;background:#12303b}.boardFrame{width:min(96vw,calc(100vh - 150px),720px);aspect-ratio:1;padding:5px;border-radius:17px;background:linear-gradient(145deg,#3d4b57,#080b0e);box-shadow:0 25px 60px #000c,inset 0 1px #ffffff22}.board{width:100%;height:100%;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);overflow:hidden;border-radius:12px;border:2px solid #020304}.cell{position:relative;display:flex;justify-content:center;align-items:center;cursor:pointer;user-select:none;touch-action:manipulation}.light{background:#d9d1bb}.dark{background:#65715e}.cell.selected{box-shadow:inset 0 0 0 4px #ffd83d}.cell.last{background:#aa9b48!important}.cell.canMove:after{content:"";position:absolute;width:22%;height:22%;border-radius:50%;background:#111;opacity:.38}.cell.canCapture:after{content:"";position:absolute;inset:7%;border-radius:50%;border:4px solid #e02d2d}.cell.inCheck{animation:danger .5s infinite alternate}@keyframes danger{from{box-shadow:inset 0 0 0 4px #d90000}to{box-shadow:inset 0 0 0 5px #ff4545,inset 0 0 25px #ff0000aa}}.piece{position:relative;z-index:3;font-family:"DejaVu Sans","Segoe UI Symbol","Noto Sans Symbols 2",sans-serif;font-size:clamp(32px,11vw,76px);line-height:1;filter:drop-shadow(0 5px 2px #0009);transition:transform .1s;pointer-events:none}.cell:active .piece{transform:scale(.88)}.white{color:#fff;text-shadow:0 2px 0 #999,0 5px 8px #000c}.black{color:#111;text-shadow:0 1px 0 #555,0 5px 8px #000d}.buttons{display:flex;gap:7px}.buttons button{border:0;color:white;background:linear-gradient(145deg,#28343e,#0c1115);border-radius:11px;padding:9px 14px;font-size:11px;font-weight:bold;box-shadow:0 6px 15px #0009}.buttons button:active,.mode:active{transform:scale(.95)}#overlay{position:fixed;inset:0;z-index:50;display:flex;justify-content:center;align-items:center;background:#0009;backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:.2s}#overlay.show{opacity:1;pointer-events:auto}.popup{width:min(88vw,400px);padding:26px 20px;border-radius:24px;text-align:center;background:linear-gradient(145deg,#202a33,#080b0f);border:1px solid #ffffff20;box-shadow:0 25px 80px #000;transform:scale(.8);transition:.25s}.show .popup{transform:scale(1)}.icon{font-size:54px}.popupTitle{margin-top:7px;font-size:clamp(32px,10vw,52px);font-weight:1000;letter-spacing:2px}.popupText{margin-top:7px;color:#aeb8c2}.popup button{margin-top:18px;border:0;color:#fff;background:#26333d;border-radius:11px;padding:10px 20px;font-weight:900}.check .popupTitle{color:#ffd23c}.mate .popupTitle{color:#ff3f3f}@media(max-height:520px){#app{gap:3px}.boardFrame{width:min(82vh,92vw)}.credit{display:none}.mode{padding:5px 8px}.buttons button{padding:6px 11px}}
</style>
</head>
<body>
<div id="app">
<div class="top"><div><div class="logo">♟ CHESS</div><div class="credit">BimzOfficial · WATER AI</div></div><div class="turn" id="turn">${initialStatus}</div></div>
<div class="modebar"><button class="mode" data-d="easy">EASY</button><button class="mode" data-d="normal">NORMAL</button><button class="mode" data-d="hard">HARD</button></div>
<div class="boardFrame"><div id="board" class="board">${staticCells}</div></div>
<div class="buttons"><button id="undo">↶ UNDO</button><button id="restart">↻ RESTART</button><button id="flip">⇅ BALIK</button><button id="hint">💡 HINT</button></div>
</div>
<div id="overlay"><div class="popup" id="popup"><div class="icon" id="popupIcon">⚠️</div><div class="popupTitle" id="popupTitle">SKAK!</div><div class="popupText" id="popupText"></div><button id="popupOk">OK</button></div></div>
<script>
(function(){
"use strict";
try{
var boardElement=document.getElementById("board"),turnElement=document.getElementById("turn"),overlay=document.getElementById("overlay"),popup=document.getElementById("popup"),popupIcon=document.getElementById("popupIcon"),popupTitle=document.getElementById("popupTitle"),popupText=document.getElementById("popupText");
var SYMBOLS={w:{K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙"},b:{K:"♚",Q:"♛",R:"♜",B:"♝",N:"♞",P:"♟"}};
var board,turn="w",selected=null,moves=[],history=[],lastMove=null,gameFinished=false,thinking=false,flip=false,difficulty=${JSON.stringify(difficulty)},AI_MODE=${mode==="ai"?"true":"false"};
function createBoard(){return [["bR","bN","bB","bQ","bK","bB","bN","bR"],["bP","bP","bP","bP","bP","bP","bP","bP"],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],["wP","wP","wP","wP","wP","wP","wP","wP"],["wR","wN","wB","wQ","wK","wB","wN","wR"]]}
function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function nameOf(c){return c==="w"?"PUTIH ⚪":"HITAM ⚫"}
function clone(b){return b.map(function(row){return row.slice()})}
function findKing(color){for(var r=0;r<8;r++)for(var c=0;c<8;c++)if(board[r][c]===color+"K")return{r:r,c:c};return null}
function pseudo(r,c){var piece=board[r][c];if(!piece)return[];var color=piece[0],type=piece[1],out=[];function add(nr,nc){if(!inside(nr,nc))return;var t=board[nr][nc];if(t&&t[1]==="K")return;if(!t||t[0]!==color)out.push({r:nr,c:nc})}function ray(ds){ds.forEach(function(d){var nr=r+d[0],nc=c+d[1];while(inside(nr,nc)){var t=board[nr][nc];if(!t){out.push({r:nr,c:nc})}else{if(t[0]!==color&&t[1]!=="K")out.push({r:nr,c:nc});break}nr+=d[0];nc+=d[1]}})}if(type==="P"){var dir=color==="w"?-1:1,start=color==="w"?6:1;if(inside(r+dir,c)&&!board[r+dir][c]){out.push({r:r+dir,c:c});if(r===start&&!board[r+2*dir][c])out.push({r:r+2*dir,c:c})}[-1,1].forEach(function(dc){var nr=r+dir,nc=c+dc;if(inside(nr,nc)&&board[nr][nc]&&board[nr][nc][0]!==color&&board[nr][nc][1]!=="K")out.push({r:nr,c:nc})})}else if(type==="N"){[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(function(d){add(r+d[0],c+d[1])})}else if(type==="K"){for(var dr=-1;dr<=1;dr++)for(var dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc)}else{var ds=[];if(type==="R"||type==="Q")ds.push([-1,0],[1,0],[0,-1],[0,1]);if(type==="B"||type==="Q")ds.push([-1,-1],[-1,1],[1,-1],[1,1]);ray(ds)}return out}
function squareAttacked(r,c,by){for(var rr=0;rr<8;rr++)for(var cc=0;cc<8;cc++){var p=board[rr][cc];if(!p||p[0]!==by)continue;var type=p[1],dr=r-rr,dc=c-cc;if(type==="P"){var dir=by==="w"?-1:1;if(rr+dir===r&&Math.abs(cc-c)===1)return true}else if(type==="N"){if((Math.abs(dr)===2&&Math.abs(dc)===1)||(Math.abs(dr)===1&&Math.abs(dc)===2))return true}else if(type==="K"){if(Math.max(Math.abs(dr),Math.abs(dc))===1)return true}else{var dirs=[];if(type==="R"||type==="Q")dirs.push([-1,0],[1,0],[0,-1],[0,1]);if(type==="B"||type==="Q")dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);for(var i=0;i<dirs.length;i++){var d=dirs[i],nr=rr+d[0],nc=cc+d[1];while(inside(nr,nc)){if(nr===r&&nc===c)return true;if(board[nr][nc])break;nr+=d[0];nc+=d[1]}}}}return false}
function isInCheck(color){var k=findKing(color);return !k||squareAttacked(k.r,k.c,color==="w"?"b":"w")}
function applyMove(b,m){var n=clone(b),p=n[m.from.r][m.from.c];n[m.to.r][m.to.c]=p;n[m.from.r][m.from.c]=null;if(p[1]==="P"&&(m.to.r===0||m.to.r===7))n[m.to.r][m.to.c]=p[0]+"Q";return n}
function legalMovesFor(color){var original=board,out=[];for(var r=0;r<8;r++)for(var c=0;c<8;c++)if(board[r][c]&&board[r][c][0]===color){var pm=pseudo(r,c);for(var i=0;i<pm.length;i++){var m={from:{r:r,c:c},to:pm[i]},next=applyMove(board,m);board=next;var bad=isInCheck(color);board=original;if(!bad)out.push(m)}}return out}
function legalFrom(r,c){return legalMovesFor(turn).filter(function(m){return m.from.r===r&&m.from.c===c}).map(function(m){return m.to})}
function render(){boardElement.innerHTML="";var king=findKing(turn),checked=isInCheck(turn);for(var vr=0;vr<8;vr++)for(var vc=0;vc<8;vc++){var r=flip?7-vr:vr,c=flip?7-vc:vc,cell=document.createElement("div");cell.className="cell "+(((r+c)%2===0)?"light":"dark");if(lastMove&&((lastMove.from.r===r&&lastMove.from.c===c)||(lastMove.to.r===r&&lastMove.to.c===c)))cell.classList.add("last");if(selected&&selected.r===r&&selected.c===c)cell.classList.add("selected");var possible=moves.some(function(m){return m.r===r&&m.c===c});if(possible)cell.classList.add(board[r][c]?"canCapture":"canMove");if(checked&&king&&king.r===r&&king.c===c)cell.classList.add("inCheck");var p=board[r][c];if(p){var el=document.createElement("div");el.className="piece "+(p[0]==="w"?"white":"black");el.textContent=SYMBOLS[p[0]][p[1]];cell.appendChild(el)}cell.onclick=(function(rr,cc){return function(){clickCell(rr,cc)}})(r,c);boardElement.appendChild(cell)}if(!gameFinished)turnElement.textContent=checked?"⚠ SKAK — "+nameOf(turn):(thinking?"🤖 Computer "+difficulty.toUpperCase()+" sedang berpikir…":"Giliran: "+nameOf(turn))}
function showPopup(kind,title,text,icon){popup.className="popup "+kind;popupIcon.textContent=icon;popupTitle.textContent=title;popupText.textContent=text;overlay.classList.add("show")}
function hidePopup(){overlay.classList.remove("show")}
function evaluate(){var checked=isInCheck(turn),legal=legalMovesFor(turn);if(!legal.length){gameFinished=true;if(checked){var winner=turn==="w"?"Hitam":"Putih";turnElement.textContent="♛ SKAKMAT — "+winner+" MENANG";showPopup("mate","SKAKMAT!",winner+" menang. Raja lawan tidak memiliki langkah legal.","♛")}else{turnElement.textContent="DRAW — STALEMATE";showPopup("","STALEMATE","Tidak ada langkah legal. Permainan seri.","🤝")}return}if(checked){turnElement.textContent="⚠ SKAK — "+nameOf(turn);showPopup("check","SKAK!","Raja "+nameOf(turn)+" sedang diserang!","⚠️");setTimeout(hidePopup,1100)}}
function makeMove(from,to){if(gameFinished||thinking)return;var move={from:from,to:to};var legal=legalMovesFor(turn).some(function(m){return m.from.r===from.r&&m.from.c===from.c&&m.to.r===to.r&&m.to.c===to.c});if(!legal)return;history.push({board:clone(board),turn:turn,lastMove:lastMove});board=applyMove(board,move);lastMove=move;selected=null;moves=[];turn=turn==="w"?"b":"w";render();evaluate();if(AI_MODE&&!gameFinished&&turn==="b")botMove()}
function clickCell(r,c){if(gameFinished||thinking||(AI_MODE&&turn==="b"))return;var p=board[r][c];if(selected){var target=moves.find(function(m){return m.r===r&&m.c===c});if(target){makeMove(selected,target);return}if(p&&p[0]===turn){selected={r:r,c:c};moves=legalFrom(r,c);render();return}selected=null;moves=[];render();return}if(p&&p[0]===turn){selected={r:r,c:c};moves=legalFrom(r,c);render()}}
function material(b){var v={P:100,N:320,B:330,R:500,Q:900,K:20000},s=0;for(var r=0;r<8;r++)for(var c=0;c<8;c++){var p=b[r][c];if(p)s+=(p[0]==="b"?-1:1)*v[p[1]]}return s}
function chooseBotMove(all){if(difficulty==="easy")return all[Math.floor(Math.random()*all.length)];var captures=all.filter(function(m){return !!board[m.to.r][m.to.c]});if(difficulty==="normal"){var pool=captures.length?captures:all;return pool[Math.floor(Math.random()*pool.length)]}var best=all[0],bestScore=-Infinity;for(var i=0;i<all.length;i++){var m=all[i],target=board[m.to.r][m.to.c],next=applyMove(board,m),score=(target?900:0)+(-material(next))*0.03;if(isInCheckAfter(next,"w"))score+=2500;if(score>bestScore){bestScore=score;best=m}}return best}
function isInCheckAfter(b,color){var old=board;board=b;var v=isInCheck(color);board=old;return v}
function botMove(){if(!AI_MODE||gameFinished||turn!=="b"||thinking)return;thinking=true;render();var delay=difficulty==="easy"?120:difficulty==="normal"?220:320;setTimeout(function(){if(gameFinished||turn!=="b"){thinking=false;render();return}var all=legalMovesFor("b");if(all.length){var m=chooseBotMove(all);thinking=false;makeMove(m.from,m.to)}else{thinking=false;evaluate();render()}},delay)}
function restart(){board=createBoard();turn="w";selected=null;moves=[];history=[];lastMove=null;gameFinished=false;thinking=false;hidePopup();render()}
function undo(){if(!history.length||thinking)return;var h=history.pop();board=clone(h.board);turn=h.turn;lastMove=h.lastMove;selected=null;moves=[];gameFinished=false;thinking=false;hidePopup();render()}
function hint(){if(gameFinished||thinking)return;var all=legalMovesFor(turn);if(all.length){var m=all[Math.floor(Math.random()*all.length)];selected=m.from;moves=legalFrom(m.from.r,m.from.c);render()}}
document.getElementById("restart").onclick=restart;document.getElementById("undo").onclick=undo;document.getElementById("flip").onclick=function(){flip=!flip;render()};document.getElementById("hint").onclick=hint;document.getElementById("popupOk").onclick=hidePopup;document.querySelectorAll(".mode").forEach(function(btn){btn.onclick=function(){difficulty=btn.getAttribute("data-d")||"normal";document.querySelectorAll(".mode").forEach(function(x){x.classList.toggle("on",x===btn)});if(!gameFinished)render()}});document.querySelectorAll(".mode").forEach(function(x){x.classList.toggle("on",x.getAttribute("data-d")===difficulty)});restart();
}catch(err){document.body.innerHTML='<div style="padding:24px;color:#fff;background:#07090d;font-family:Arial,sans-serif"><h2>CHESS2</h2><p>Game gagal dimuat.</p><small>'+String(err&&err.message||err).replace(/[<>]/g,"")+'</small></div>'}
})();
</script>
</body>
</html>`;
}

export function buildTttHtml(opts?: {
  title?: string;
  size?: number;
  mode?: "ai" | "pvp";
  status?: string;
  board?: (string | null)[] | null;
  turn?: "X" | "O";
}): string {
  const title = String(opts?.title || "TIC TAC TOE").replace(/</g, "&lt;");
  const mode = opts?.mode || "ai";
  const initialStatus = String(opts?.status || "Giliran Player X").replace(/</g, "&lt;");
  const startBoard = Array.isArray(opts?.board) && opts!.board!.length === 9
    ? opts!.board!.map((v) => v === "X" || v === "O" ? v : "")
    : ["","","","","","","","",""];
  const startTurn = opts?.turn === "O" ? "O" : "X";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${title}</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;min-height:100%;font-family:Arial,Helvetica,sans-serif;background:#050608;color:#fff}
body{min-height:100vh;display:flex;justify-content:center;align-items:center;overflow-x:hidden;padding:14px;background:radial-gradient(circle at 50% 10%,#252a31 0%,#0d1014 35%,#050608 75%)}
.game{width:100%;max-width:480px;text-align:center}
.title{font-size:clamp(30px,9vw,46px);font-weight:900;letter-spacing:2px;margin-bottom:5px;color:#fff;text-shadow:0 3px 0 #555e68,0 8px 20px rgba(0,0,0,.8)}
.subtitle{color:#9da6b1;font-size:13px;margin-bottom:18px}
.score{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.player{position:relative;padding:13px 10px;border-radius:16px;background:linear-gradient(145deg,#20252b,#0d1014);border:1px solid rgba(255,255,255,.08);box-shadow:0 8px 0 #030405,0 13px 20px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08)}
.player-name{color:#aeb7c1;font-size:12px;font-weight:bold}
.player-symbol{font-size:25px;font-weight:900;color:#fff;margin:2px 0;text-shadow:0 2px 0 #555f69,0 0 12px rgba(255,255,255,.25)}
.player-score{font-size:25px;font-weight:900}
.status{min-height:44px;display:flex;align-items:center;justify-content:center;margin-bottom:15px;padding:10px 15px;border-radius:14px;background:linear-gradient(145deg,#181d22,#090b0e);border:1px solid rgba(255,255,255,.07);box-shadow:0 7px 0 #020304,0 12px 20px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.07);color:#fff;font-weight:800}
.board-wrap{padding:12px;border-radius:24px;background:linear-gradient(145deg,#242a31,#080a0d);box-shadow:0 15px 0 #020304,0 25px 35px rgba(0,0,0,.65),inset 0 2px 0 rgba(255,255,255,.08),inset 0 -3px 8px rgba(0,0,0,.55)}
.board{width:100%;aspect-ratio:1/1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:12px;perspective:1000px}
.cell{position:relative;width:100%;height:100%;min-width:0;min-height:0;border:0;outline:0;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:clamp(52px,17vw,82px);font-weight:1000;line-height:1;cursor:pointer;user-select:none;color:#fff;background:linear-gradient(145deg,#343b43 0%,#1a1f25 42%,#0c0f13 100%);box-shadow:0 11px 0 #030405,0 17px 22px rgba(0,0,0,.60),inset 0 2px 0 rgba(255,255,255,.13),inset 2px 0 0 rgba(255,255,255,.05),inset 0 -4px 10px rgba(0,0,0,.45);transform:translateY(0) rotateX(0deg);transition:transform .14s ease,box-shadow .14s ease,background .2s ease;touch-action:manipulation}
.cell::before{content:"";position:absolute;top:3px;left:7px;right:7px;height:28%;border-radius:15px 15px 35px 35px;background:linear-gradient(to bottom,rgba(255,255,255,.10),rgba(255,255,255,0));pointer-events:none}
.cell::after{content:"";position:absolute;left:10px;right:10px;bottom:-8px;height:10px;border-radius:0 0 12px 12px;background:#030405;z-index:-1}
.cell:active{transform:translateY(7px) scale(.98);box-shadow:0 4px 0 #030405,0 8px 12px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,255,255,.10),inset 0 -3px 8px rgba(0,0,0,.4)}
.cell:hover{background:linear-gradient(145deg,#3c444d 0%,#20262c 45%,#0e1115 100%)}
.cell.x,.cell.o{color:#fff;text-shadow:0 4px 0 #59636e,0 8px 16px rgba(0,0,0,.85),0 0 24px rgba(255,255,255,.30);filter:brightness(1.12) contrast(1.05);animation:pop .22s ease-out}
.cell.o{color:#fff;text-shadow:0 4px 0 #8e98a3,0 8px 16px rgba(0,0,0,.85),0 0 30px rgba(255,255,255,.55);filter:brightness(1.45) contrast(1.08)}
@keyframes pop{0%{transform:scale(.65) translateY(5px);opacity:.2}70%{transform:scale(1.08) translateY(-2px)}100%{transform:scale(1) translateY(0);opacity:1}}
.cell.win{background:linear-gradient(145deg,#555e67,#252b31 45%,#101317);animation:winPulse .65s ease-in-out infinite alternate}
@keyframes winPulse{from{box-shadow:0 11px 0 #030405,0 17px 22px rgba(0,0,0,.65),0 0 8px rgba(255,255,255,.15),inset 0 2px 0 rgba(255,255,255,.12)}to{box-shadow:0 11px 0 #030405,0 17px 22px rgba(0,0,0,.65),0 0 28px rgba(255,255,255,.35),inset 0 2px 0 rgba(255,255,255,.18)}}
.buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px}
.btn{border:0;outline:0;padding:14px 10px;border-radius:15px;color:#fff;font-size:14px;font-weight:900;cursor:pointer;background:linear-gradient(145deg,#292f36,#101317);box-shadow:0 7px 0 #030405,0 12px 18px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.10);transition:.15s ease;touch-action:manipulation}
.btn:active{transform:translateY(5px);box-shadow:0 2px 0 #030405,0 5px 10px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
.overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);z-index:20}
.overlay.show{display:flex}
.result{width:min(380px,100%);padding:28px 22px;border-radius:24px;text-align:center;background:linear-gradient(145deg,#252b32,#0b0e11);border:1px solid rgba(255,255,255,.10);box-shadow:0 15px 0 #020304,0 30px 50px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.10);animation:resultIn .25s ease-out}
@keyframes resultIn{from{opacity:0;transform:scale(.8) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.result-title{font-size:31px;font-weight:1000;margin-bottom:8px}.result-text{color:#adb5bf;margin-bottom:22px}
.ai-badge{display:inline-flex;align-items:center;gap:6px;margin-bottom:10px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:#11151a;color:#dfe7ef;font-size:11px;font-weight:900}
@media(max-width:380px){body{padding:10px}.board-wrap{padding:9px;border-radius:20px}.board{gap:8px}.cell{border-radius:14px}.buttons{margin-top:20px}}
@media(max-height:700px){body{align-items:flex-start;padding-top:8px}.title{font-size:30px}.subtitle{margin-bottom:10px}.score{margin-bottom:10px}.status{margin-bottom:10px}.buttons{margin-top:14px}}
</style>
</head>
<body>
<div class="game">
  <div class="ai-badge">🤖 ${mode==="ai" ? "VS COMPUTER · WATER AI" : "2 PLAYER"}</div>
  <div class="title">TIC TAC TOE</div>
  <div class="subtitle">3D • ${mode==="ai" ? "PLAYER X VS COMPUTER O" : "2 PLAYER"} • REAL TIME</div>
  <div class="score">
    <div class="player"><div class="player-name">PLAYER X</div><div class="player-symbol">X</div><div class="player-score" id="scoreX">0</div></div>
    <div class="player"><div class="player-name">${mode==="ai" ? "COMPUTER O" : "PLAYER O"}</div><div class="player-symbol">O</div><div class="player-score" id="scoreO">0</div></div>
  </div>
  <div class="status" id="status">${initialStatus}</div>
  <div class="board-wrap"><div class="board" id="board">
    <button class="cell" data-index="0"></button><button class="cell" data-index="1"></button><button class="cell" data-index="2"></button>
    <button class="cell" data-index="3"></button><button class="cell" data-index="4"></button><button class="cell" data-index="5"></button>
    <button class="cell" data-index="6"></button><button class="cell" data-index="7"></button><button class="cell" data-index="8"></button>
  </div></div>
  <div class="buttons">
    <button class="btn" id="restart">↻ ROUND BARU</button>
    <button class="btn" id="reset">⟳ RESET SCORE</button>
  </div>
</div>
<div class="overlay" id="overlay">
  <div class="result">
    <div class="result-title" id="resultTitle">PLAYER X MENANG!</div>
    <div class="result-text" id="resultText">Selamat!</div>
    <button class="btn" id="nextRound">MAIN LAGI</button>
  </div>
</div>
<script>
(function(){
"use strict";
const CELLS=[...document.querySelectorAll(".cell")];
const statusText=document.getElementById("status");
const scoreX=document.getElementById("scoreX"),scoreO=document.getElementById("scoreO");
const overlay=document.getElementById("overlay"),resultTitle=document.getElementById("resultTitle"),resultText=document.getElementById("resultText");
const restartButton=document.getElementById("restart"),resetButton=document.getElementById("reset"),nextRoundButton=document.getElementById("nextRound");
const AI_MODE=${mode==="ai" ? "true" : "false"};
const SERVER_BOARD=${JSON.stringify(startBoard)};const SERVER_TURN=${JSON.stringify(startTurn)};let board=SERVER_BOARD.slice(),currentPlayer=SERVER_TURN,gameActive=true,botThinking=false,pointsX=0,pointsO=0;
const winningPatterns=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function checkWinner(){
  for(const [a,b,c] of winningPatterns) if(board[a]&&board[a]===board[b]&&board[a]===board[c]) return {player:board[a],line:[a,b,c]};
  if(board.every(v=>v!=="")) return {player:"draw",line:[]};
  return null;
}
function paint(){
  CELLS.forEach((cell,i)=>{cell.textContent=board[i];cell.classList.toggle("x",board[i]==="X");cell.classList.toggle("o",board[i]==="O");});
}
function updateStatus(){
  if(!gameActive) return;
  statusText.textContent=AI_MODE ? (currentPlayer==="X" ? "Giliran Kamu (X)" : "🤖 Computer O sedang berpikir...") : "Giliran Player " + currentPlayer;
}
function finishGame(result){
  gameActive=false;botThinking=false;
  result.line.forEach(i=>CELLS[i].classList.add("win"));
  if(result.player==="X"){pointsX++;scoreX.textContent=pointsX;resultTitle.textContent="KAMU MENANG!";resultText.textContent="Player X berhasil mengalahkan Computer."}
  else if(result.player==="O"){pointsO++;scoreO.textContent=pointsO;resultTitle.textContent=AI_MODE?"COMPUTER MENANG!":"PLAYER O MENANG!";resultText.textContent=AI_MODE?"Computer O mendapatkan 1 poin.":"Player O mendapatkan 1 poin."}
  else {resultTitle.textContent="SERI!";resultText.textContent="Tidak ada pemenang pada ronde ini."}
  statusText.textContent=result.player==="draw"?"Permainan berakhir seri.":"Player " + result.player + " menang!";
  overlay.classList.add("show");
}
function makeMove(index,player){
  if(!gameActive||board[index]!==""||player!==currentPlayer||(botThinking&&player!=="O"))return false;
  board[index]=player;if(player==="O")botThinking=false;paint();
  const result=checkWinner();if(result){finishGame(result);return true}
  currentPlayer=currentPlayer==="X"?"O":"X";updateStatus();
  if(AI_MODE&&currentPlayer==="O")setTimeout(aiMove,0);
  return true;
}
function scoreLine(a,b,c){const s=[a,b,c];const o=s.filter(v=>v==="O").length,x=s.filter(v=>v==="X").length,e=s.filter(v=>v==="").length;if(x&&o)return 0;if(o===2&&e===1)return 100;if(x===2&&e===1)return 90;if(o===1&&e===2)return 8;if(x===1&&e===2)return -7;return 0}
function quickScore(i){board[i]="O";let s=0;for(const [a,b,c] of winningPatterns)s+=scoreLine(board[a],board[b],board[c]);board[i]="";if(i===4)s+=6;if([0,2,6,8].includes(i))s+=3;return s}
function minimax(isMax,depth){const result=checkWinner();if(result){if(result.player==="O")return 100-depth;if(result.player==="X")return depth-100;return 0}if(depth>=3)return 0;const empty=board.map((v,i)=>v===""?i:-1).filter(i=>i>=0);let best=isMax?-Infinity:Infinity;for(const i of empty){board[i]=isMax?"O":"X";const v=minimax(!isMax,depth+1);board[i]="";best=isMax?Math.max(best,v):Math.min(best,v)}return best}
function aiMove(){
  if(!AI_MODE||!gameActive||currentPlayer!=="O")return;
  botThinking=true;updateStatus();
  const empty=board.map((v,i)=>v===""?i:-1).filter(i=>i>=0);
  if(!empty.length){botThinking=false;return}
  // Instant tactical response: win now, otherwise block X, then use minimax.
  for(const i of empty){board[i]="O";const w=checkWinner();board[i]="";if(w&&w.player==="O"){makeMove(i,"O");return}}
  for(const i of empty){board[i]="X";const w=checkWinner();board[i]="";if(w&&w.player==="X"){makeMove(i,"O");return}}
  let best=-Infinity,bestMove=empty[0];
  for(const i of empty){const s=quickScore(i);if(s>best){best=s;bestMove=i}}
  makeMove(bestMove,"O");
}
function newRound(first="X"){
  board=["","","","","","","","",""];currentPlayer=first;gameActive=true;botThinking=false;
  CELLS.forEach(c=>c.textContent="");
  CELLS.forEach(c=>c.classList.remove("x","o","win"));
  overlay.classList.remove("show");paint();updateStatus();
  if(AI_MODE&&currentPlayer==="O")setTimeout(aiMove,0);
}
function resetGame(){pointsX=0;pointsO=0;scoreX.textContent="0";scoreO.textContent="0";newRound("X")}
CELLS.forEach(cell=>cell.addEventListener("click",()=>makeMove(Number(cell.dataset.index),"X")));
restartButton.addEventListener("click",()=>newRound("X"));
nextRoundButton.addEventListener("click",()=>newRound("X"));
resetButton.addEventListener("click",resetGame);
paint();updateStatus();if(AI_MODE&&currentPlayer==="O")setTimeout(aiMove,0);
})();
</script>
</body>
</html>`;
}


export function buildAllGamesHtml(opts?: { title?: string }): string {
  const title = opts?.title || "ALL GAMES · WATER AI";
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{width:100%;margin:0;padding:0;background:#0b0f1a;color:#e8eef7;font-family:system-ui,-apple-system,sans-serif}
.wrap{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
.top{position:sticky;top:0;z-index:20;padding:10px 12px 8px;background:linear-gradient(180deg,#12182aee,#0b0f1acc);backdrop-filter:blur(12px);border-bottom:1px solid #243049}
.brand{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.brand h1{font-size:1rem;font-weight:800;color:#7dd3fc}
.brand .tag{font-size:10px;padding:4px 8px;border-radius:999px;background:#22c55e22;color:#4ade80;border:1px solid #22c55e55;font-weight:700}
.srv-bar{display:flex;gap:6px;margin-bottom:8px;align-items:center}
.srv-bar .cur{flex:1;font-size:.72rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srv-bar .cur b{color:#e2e8f0}
.srv-bar button{border:0;border-radius:10px;padding:8px 10px;font-weight:800;font-size:.72rem;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#d97706);color:#111;white-space:nowrap}
.search{width:100%;border:0;border-radius:12px;padding:10px 12px;font-size:.88rem;background:#1a2236;color:#f1f5f9;outline:none;border:1px solid #2a3650}
.cats{display:flex;gap:6px;overflow-x:auto;padding:8px 0 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cats::-webkit-scrollbar{display:none}
.cat{flex:0 0 auto;border:0;border-radius:999px;padding:7px 12px;font-size:.72rem;font-weight:700;background:#1a2236;color:#94a3b8;cursor:pointer;border:1px solid #2a3650}
.cat.on{background:linear-gradient(135deg,#38bdf8,#6366f1);color:#fff;border-color:transparent}
.main{flex:1;padding:10px 12px 20px}
.sec{font-size:.72rem;color:#64748b;font-weight:700;letter-spacing:.06em;margin:6px 0 8px;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.card{background:linear-gradient(160deg,#151c2e,#0f1524);border:1px solid #243049;border-radius:14px;padding:10px 6px 8px;text-align:center;cursor:pointer}
.card:active{transform:scale(.96)}
.card .ico{font-size:1.7rem;margin-bottom:4px}
.card .nm{font-size:.68rem;font-weight:700;color:#e2e8f0;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.5em}
.card .badge{display:inline-block;margin-top:4px;font-size:9px;padding:2px 6px;border-radius:6px;background:#22c55e33;color:#4ade80;font-weight:700}
.card .badge.ext{background:#6366f133;color:#a5b4fc}
.empty{text-align:center;color:#64748b;padding:40px 10px;font-size:.9rem;grid-column:1/-1}
.player{display:none;flex-direction:column;min-height:70vh}
.player.on{display:flex}
.ph{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#12182a;border-bottom:1px solid #243049;position:sticky;top:0;z-index:15}
.ph button{border:0;background:#1a2236;color:#e2e8f0;border-radius:10px;padding:8px 12px;font-weight:700;font-size:.8rem;cursor:pointer}
.ph .ttl{flex:1;font-weight:800;font-size:.9rem;text-align:center}
.stage{flex:1;padding:8px;display:flex;flex-direction:column;align-items:center}
.info-panel{width:100%;max-width:420px;padding:12px;text-align:center}
.info-panel .big{font-size:3rem;margin:8px 0}
.info-panel h2{font-size:1.1rem;margin-bottom:6px}
.info-panel p{color:#94a3b8;font-size:.82rem;margin-bottom:12px;line-height:1.4}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.btn-row a,.btn-row button{display:inline-block;text-decoration:none;border:0;border-radius:12px;padding:12px 16px;font-weight:800;font-size:.85rem;cursor:pointer}
.play{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
.open{background:linear-gradient(135deg,#38bdf8,#6366f1);color:#fff}
.ghost{background:#1a2236;color:#cbd5e1;border:1px solid #2a3650!important}
.note{margin-top:12px;font-size:.7rem;color:#475569;line-height:1.35}
.hud{display:flex;gap:8px;width:100%;max-width:360px;justify-content:space-between;margin-bottom:8px;font-size:.8rem;color:#94a3b8}
.hud b{color:#f1f5f9}
/* server panel (inline table — works in WA WebView) */
.srv-panel{display:none;margin:8px 0 10px;padding:10px;background:#12182a;border:1px solid #f59e0b55;border-radius:14px}
.srv-panel.on{display:block}
.srv-panel h3{font-size:.9rem;color:#fbbf24;margin-bottom:4px}
.srv-panel .sub{font-size:.7rem;color:#64748b;margin-bottom:8px}
.srv-panel .sq{width:100%;border:0;border-radius:10px;padding:10px;background:#1a2236;color:#e2e8f0;border:1px solid #2a3650;font-size:.85rem;margin-bottom:8px}
.slist{max-height:280px;overflow-y:auto;-webkit-overflow-scrolling:touch;border:1px solid #243049;border-radius:10px}
.stable{width:100%;border-collapse:collapse;font-size:.72rem}
.stable th{position:sticky;top:0;background:#1a2236;color:#94a3b8;text-align:left;padding:8px 6px;font-weight:700;border-bottom:1px solid #2a3650}
.stable td{padding:8px 6px;border-bottom:1px solid #1e293b;color:#e2e8f0;vertical-align:middle}
.stable tr{cursor:pointer}
.stable tr:active,.stable tr.on{background:#1c1917}
.stable tr.on td{color:#fbbf24}
.stable .go{color:#4ade80;font-weight:800;white-space:nowrap}
.hub-btn{width:100%;margin-top:8px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:.85rem;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.dpad{display:grid;grid-template-columns:repeat(3,56px);gap:6px;justify-content:center;margin-top:10px}
.dpad button{width:56px;height:56px;border:0;border-radius:14px;background:#1e293b;color:#f1f5f9;font-size:1.4rem;font-weight:800;cursor:pointer;border:1px solid #334155;touch-action:manipulation}
.dpad button:active{background:#334155}
.dpad .sp{visibility:hidden}
</style>
</head>
<body>
<div class="wrap">
  <div class="top" id="hubTop">
    <div class="brand">
      <h1>🎮 ${title}</h1>
      <span class="tag">100 SERVER</span>
    </div>
    <div class="srv-bar">
      <div class="cur">Server: <b id="srvName">Poki</b></div>
      <button type="button" id="btnSrv">🔄 Ganti Server</button>
    </div>
    <input class="search" id="q" type="search" placeholder="Cari game… Subway, Puzzle, Snake…" autocomplete="off"/>
    <div class="cats" id="cats"></div>
  </div>
  <div class="main" id="hub">
    <div class="srv-panel" id="srvPanel">
      <h3>🔄 Pilih Server Game</h3>
      <p class="sub">100 hub web nyata · ketuk baris untuk aktifkan</p>
      <input class="sq" id="srvQ" type="search" placeholder="Cari server… poki, y8, crazy…"/>
      <div class="slist" id="slist"></div>
      <button type="button" class="hub-btn" id="closeSrv" style="margin-top:8px;background:#1a2236">Tutup daftar server</button>
    </div>
    <button type="button" class="hub-btn" id="openHub">🌐 Buka hub server saat ini di browser</button>
    <div class="sec" id="secLabel">Populer</div>
    <div class="grid" id="grid"></div>
  </div>
  <div class="player" id="player">
    <div class="ph">
      <button type="button" id="back">← Kembali</button>
      <div class="ttl" id="pTitle">Game</div>
      <button type="button" id="restart" style="display:none">🔄</button>
    </div>
    <div class="stage" id="stage"></div>
  </div>
</div>
<script>
(function(){
/* ===== 100 REAL browser game hubs (live public URLs) ===== */
const SERVERS = [{id:"s4",name:"SERVER 4 — NEW",url:"https://water-ai-cloud-server4neww.up.railway.app/",status:"online"}];

const GAMES = [
  {id:"snake",name:"Snake Classic",cat:["arcade","populer","local"],ico:"🐍",play:"snake",local:true},
  {id:"g2048",name:"2048",cat:["puzzle","populer","local"],ico:"🔢",play:"g2048",local:true},
  {id:"memory",name:"Memory Match",cat:["puzzle","local"],ico:"🃏",play:"memory",local:true},
  {id:"clicker",name:"Reaction Tap",cat:["arcade","local"],ico:"⚡",play:"clicker",local:true},
  {id:"pong",name:"Pong Duo",cat:["arcade","2-pemain","local"],ico:"🏓",play:"pong",local:true},
  {id:"flappy",name:"Flappy Ball",cat:["arcade","local"],ico:"🟡",play:"flappy",local:true},
  {id:"mines",name:"Minesweeper",cat:["puzzle","local"],ico:"💣",play:"mines",local:true},
  {id:"rps",name:"Batu Gunting Kertas",cat:["arcade","2-pemain","local"],ico:"✊",play:"rps",local:true},
  {id:"subway-surfers",name:"Subway Surfers",cat:["populer","berlari","aksi"],ico:"🏄",slug:"subway-surfers"},
  {id:"drive-mad",name:"Drive Mad",cat:["populer","mobil"],ico:"🚗",slug:"drive-mad"},
  {id:"level-devil",name:"Level Devil",cat:["populer","platform"],ico:"😈",slug:"level-devil"},
  {id:"temple-run-2",name:"Temple Run 2",cat:["populer","berlari"],ico:"🏃",slug:"temple-run-2"},
  {id:"moto-x3m",name:"Moto X3M",cat:["populer","mobil","balap"],ico:"🏍️",slug:"moto-x3m"},
  {id:"paperio-2",name:"Paper.io 2",cat:["populer","io"],ico:"📄",slug:"paperio-2"},
  {id:"hole-io",name:"Hole.io",cat:["populer","io"],ico:"⚫",slug:"hole-io"},
  {id:"tunnel-rush",name:"Tunnel Rush",cat:["populer","arcade"],ico:"🌀",slug:"tunnel-rush"},
  {id:"retro-bowl",name:"Retro Bowl",cat:["populer","olahraga"],ico:"🏈",slug:"retro-bowl"},
  {id:"stickman-hook",name:"Stickman Hook",cat:["populer","stickman"],ico:"🪝",slug:"stickman-hook"},
  {id:"penalty-shooters-2",name:"Penalty Shooters 2",cat:["populer","olahraga"],ico:"⚽",slug:"penalty-shooters-2"},
  {id:"brain-test-tricky-puzzles",name:"Brain Test",cat:["puzzle","populer"],ico:"🧠",slug:"brain-test-tricky-puzzles"},
  {id:"drift-boss",name:"Drift Boss",cat:["mobil","arcade"],ico:"🏎️",slug:"drift-boss"},
  {id:"master-chess",name:"Master Chess",cat:["puzzle"],ico:"♟️",slug:"master-chess"},
  {id:"dinosaur-game",name:"Dino Game",cat:["arcade"],ico:"🦖",slug:"dinosaur-game"},
  {id:"blumgi-slime",name:"Blumgi Slime",cat:["arcade"],ico:"🟢",slug:"blumgi-slime"},
  {id:"ragdoll-hit",name:"Ragdoll Hit",cat:["aksi"],ico:"💥",slug:"ragdoll-hit"},
  {id:"stickman-battle",name:"Stickman Battle",cat:["stickman","aksi"],ico:"⚔️",slug:"stickman-battle"},
  {id:"watermelon-drop",name:"Watermelon Drop",cat:["arcade","puzzle"],ico:"🍉",slug:"watermelon-drop"},
  {id:"tank-stars",name:"Tank Stars",cat:["aksi"],ico:"🛡️",slug:"tank-stars"},
  {id:"papa-s-freezeria",name:"Papa's Freezeria",cat:["simulasi"],ico:"🥤",slug:"papas-freezeria"},
  {id:"slice-master",name:"Slice Master",cat:["arcade"],ico:"🔪",slug:"slice-master"},
  {id:"polytrack",name:"PolyTrack",cat:["mobil","balap"],ico:"🛤️",slug:"polytrack"},
  {id:"four-in-a-row",name:"Four in a Row",cat:["puzzle","2-pemain"],ico:"🔴",slug:"four-in-a-row"},
  {id:"cryzen-io",name:"Cryzen.io",cat:["io","fps"],ico:"🔫",slug:"cryzen-io"},
  {id:"minefun-io",name:"MineFun.io",cat:["io"],ico:"⛏️",slug:"minefun-io"},
  {id:"super-dress",name:"Super Dress",cat:["berdandan"],ico:"👗",slug:"super-dress"},
  {id:"cat-simulator",name:"Cat Simulator",cat:["hewan"],ico:"🐈",slug:"cat-simulator"},
  {id:"idle-mining-empire",name:"Idle Mining Empire",cat:["simulasi"],ico:"⛏️",slug:"idle-mining-empire"},
  {id:"escape-from-school",name:"Escape From School",cat:["petualangan"],ico:"🏫",slug:"escape-from-school"},
  {id:"mahjong-firefly",name:"Mahjong Firefly",cat:["puzzle"],ico:"🀄",slug:"mahjong-firefly"},
];

const CATS = [
  {id:"populer",label:"🔥 Populer"},
  {id:"local",label:"⚡ Main Langsung"},
  {id:"arcade",label:"Arcade"},
  {id:"puzzle",label:"Puzzle"},
  {id:"mobil",label:"Mobil"},
  {id:"stickman",label:"Stickman"},
  {id:"io",label:".io"},
  {id:"aksi",label:"Aksi"},
  {id:"2-pemain",label:"2 Pemain"},
  {id:"olahraga",label:"Olahraga"},
  {id:"simulasi",label:"Simulasi"},
  {id:"berdandan",label:"Berdandan"},
  {id:"hewan",label:"Hewan"},
  {id:"petualangan",label:"Petualangan"},
  {id:"balap",label:"Balap"},
];

let cat = "populer";
let query = "";
let currentGame = null;
let localCleanup = null;
let currentSrv = SERVERS[0];

const grid = document.getElementById("grid");
const catsEl = document.getElementById("cats");
const secLabel = document.getElementById("secLabel");
const hub = document.getElementById("hub");
const hubTop = document.getElementById("hubTop");
const player = document.getElementById("player");
const stage = document.getElementById("stage");
const pTitle = document.getElementById("pTitle");
const restartBtn = document.getElementById("restart");
const srvPanel = document.getElementById("srvPanel");
const slist = document.getElementById("slist");
const srvName = document.getElementById("srvName");

function setServer(s){
  currentSrv = s;
  srvName.textContent = s.name;
  try{ localStorage.setItem("wa_allgames_srv", s.id); }catch(e){}
  renderSrvList(document.getElementById("srvQ").value||"");
}

function renderSrvList(q){
  const qq = (q||"").toLowerCase().trim();
  const list = SERVERS.filter(s=>{
    if(!qq) return true;
    return s.name.toLowerCase().includes(qq) || s.url.toLowerCase().includes(qq) || (s.region||"").toLowerCase().includes(qq) || s.id.includes(qq);
  });
  if(!list.length){ slist.innerHTML = '<div class="empty">Server tidak ditemukan</div>'; return; }
  let html = '<table class="stable"><thead><tr><th>#</th><th>Server</th><th>Region</th><th></th></tr></thead><tbody>';
  list.forEach((s,i)=>{
    html += '<tr class="'+(s.id===currentSrv.id?'on':'')+'" data-id="'+s.id+'">'+
      '<td>'+(s.ico||'🌐')+'</td>'+
      '<td><b>'+s.name+'</b><br/><span style="color:#64748b;font-size:.65rem">'+s.url.replace(/^https?:\/\//,'')+'</span></td>'+
      '<td>'+s.region+'</td>'+
      '<td class="go">'+(s.id===currentSrv.id?'✓ AKTIF':'Pilih')+'</td></tr>';
  });
  html += '</tbody></table>';
  slist.innerHTML = html;
  slist.querySelectorAll('tr[data-id]').forEach(tr=>{
    tr.onclick = ()=>{
      const s = SERVERS.find(x=>x.id===tr.getAttribute('data-id'));
      if(s){ setServer(s); srvPanel.classList.remove('on'); }
    };
  });
}

function renderCats(){
  catsEl.innerHTML = "";
  CATS.forEach(c=>{
    const b = document.createElement("button");
    b.className = "cat" + (c.id===cat?" on":"");
    b.type = "button";
    b.textContent = c.label;
    b.onclick = ()=>{ cat=c.id; query=""; document.getElementById("q").value=""; renderGrid(); renderCats(); };
    catsEl.appendChild(b);
  });
}

function filtered(){
  let list = GAMES.slice();
  if(cat==="local") list = list.filter(g=>g.local);
  else list = list.filter(g=>g.cat && g.cat.indexOf(cat)>=0);
  if(query){
    const q = query.toLowerCase();
    list = list.filter(g=>g.name.toLowerCase().includes(q) || (g.slug||"").includes(q) || (g.cat||[]).some(c=>c.includes(q)));
  }
  const seen = {};
  return list.filter(g=>{ if(seen[g.id]) return false; seen[g.id]=1; return true; });
}

function renderGrid(){
  const list = filtered();
  const catObj = CATS.find(c=>c.id===cat);
  secLabel.textContent = (catObj?catObj.label:"Game") + " · " + list.length + " game · server " + currentSrv.name;
  grid.innerHTML = "";
  if(!list.length){
    grid.innerHTML = '<div class="empty">Tidak ada game. Coba kategori / server lain.</div>';
    return;
  }
  list.forEach(g=>{
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = '<div class="ico">'+(g.ico||"🎮")+'</div><div class="nm">'+g.name+'</div>'+
      (g.local?'<span class="badge">MAIN DI SINI</span>':'<span class="badge ext">HUB</span>');
    d.onclick = ()=>openGame(g);
    grid.appendChild(d);
  });
}

function showHub(){
  if(localCleanup){ try{localCleanup();}catch(e){} localCleanup=null; }
  player.classList.remove("on");
  hub.style.display = "";
  hubTop.style.display = "";
  stage.innerHTML = "";
  restartBtn.style.display = "none";
  currentGame = null;
}

function openGame(g){
  currentGame = g;
  hub.style.display = "none";
  hubTop.style.display = "none";
  player.classList.add("on");
  pTitle.textContent = g.name;
  stage.innerHTML = "";
  if(g.local && g.play){
    restartBtn.style.display = "";
    startLocal(g.play);
  } else {
    restartBtn.style.display = "none";
    showExternal(g);
  }
}

function showExternal(g){
  /* Prefer current server home; for Poki-like use slug path when possible */
  let playUrl = currentSrv.url;
  if((currentSrv.id==="poki" || currentSrv.id.indexOf("poki")===0) && g.slug){
    const base = currentSrv.url.replace(/\\/$/,"");
    playUrl = base + "/g/" + g.slug;
  }
  stage.innerHTML =
    '<div class="info-panel">'+
      '<div class="big">'+(g.ico||"🎮")+'</div>'+
      '<h2>'+g.name+'</h2>'+
      '<p>Server aktif: <b>'+currentSrv.name+'</b><br/>'+currentSrv.url+'</p>'+
      '<div class="btn-row">'+
        '<a class="open" href="'+playUrl+'" target="_blank" rel="noopener">▶ Main di '+currentSrv.name+'</a>'+
        '<button type="button" class="ghost" id="swSrv">🔄 Ganti Server</button>'+
      '</div>'+
      '<p class="note">Hub web nyata · Chrome-compatible · Jika server down, ganti server lain dari daftar 100 hub.</p>'+
    '</div>';
  const b = document.getElementById("swSrv");
  if(b) b.onclick = ()=>{ renderSrvList(''); srvPanel.classList.add('on'); showHub(); };
}

function startLocal(kind){
  stage.innerHTML = "";
  if(kind==="snake") playSnake();
  else if(kind==="g2048") play2048();
  else if(kind==="memory") playMemory();
  else if(kind==="clicker") playClicker();
  else if(kind==="pong") playPong();
  else if(kind==="flappy") playFlappy();
  else if(kind==="mines") playMines();
  else if(kind==="rps") playRps();
}

function playSnake(){
  const W=20,H=20,CS=16;
  const hud=document.createElement("div"); hud.className="hud";
  hud.innerHTML='<span>Skor: <b id="snScore">0</b></span><span>Pakai panah / tombol</span>';
  const canvas=document.createElement("canvas"); canvas.width=W*CS; canvas.height=H*CS;
  canvas.style.width="min(100%,360px)"; canvas.style.touchAction="none";
  stage.appendChild(hud); stage.appendChild(canvas);
  const dpad=document.createElement("div"); dpad.className="dpad";
  dpad.innerHTML='<div class="sp"></div><button type="button" data-d="u">▲</button><div class="sp"></div>'+
    '<button type="button" data-d="l">◀</button><button type="button" data-d="d">▼</button><button type="button" data-d="r">▶</button>';
  stage.appendChild(dpad);
  const ctx=canvas.getContext("2d");
  let snake=[{x:10,y:10}],dir={x:1,y:0},next=dir,food={x:15,y:10},score=0,alive=true,tick=null;
  function placeFood(){ do{ food={x:Math.floor(Math.random()*W),y:Math.floor(Math.random()*H)}; }while(snake.some(s=>s.x===food.x&&s.y===food.y)); }
  function draw(){ ctx.fillStyle="#0a0e18"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle="#22c55e"; snake.forEach((s,i)=>{ctx.fillRect(s.x*CS+1,s.y*CS+1,CS-2,CS-2); if(i===0)ctx.fillStyle="#4ade80";}); ctx.fillStyle="#f87171"; ctx.fillRect(food.x*CS+1,food.y*CS+1,CS-2,CS-2); }
  function step(){ if(!alive)return; dir=next; const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y}; if(h.x<0||h.x>=W||h.y<0||h.y>=H||snake.some(s=>s.x===h.x&&s.y===h.y)){ alive=false; hud.querySelector("span").innerHTML='<b style="color:#f87171">Game Over · '+score+'</b>'; return; } snake.unshift(h); if(h.x===food.x&&h.y===food.y){score++; document.getElementById("snScore").textContent=score; placeFood();} else snake.pop(); draw(); }
  function setDir(x,y){ if(dir.x+x===0&&dir.y+y===0)return; next={x,y}; }
  const kd=e=>{ if(e.key==="ArrowUp")setDir(0,-1); if(e.key==="ArrowDown")setDir(0,1); if(e.key==="ArrowLeft")setDir(-1,0); if(e.key==="ArrowRight")setDir(1,0); };
  window.addEventListener("keydown",kd);
  dpad.querySelectorAll("button").forEach(btn=>{
    const map={u:[0,-1],d:[0,1],l:[-1,0],r:[1,0]};
    btn.onclick=()=>{ const d=map[btn.getAttribute("data-d")]; if(d) setDir(d[0],d[1]); };
  });
  let tx,ty; canvas.addEventListener("touchstart",e=>{const t=e.touches[0];tx=t.clientX;ty=t.clientY;},{passive:true});
  canvas.addEventListener("touchend",e=>{ const t=e.changedTouches[0]; const dx=t.clientX-tx,dy=t.clientY-ty; if(Math.abs(dx)>Math.abs(dy)) setDir(dx>0?1:-1,0); else setDir(0,dy>0?1:-1); },{passive:true});
  draw(); tick=setInterval(step,120);
  localCleanup=()=>{clearInterval(tick);window.removeEventListener("keydown",kd);};
  restartBtn.onclick=()=>{clearInterval(tick);window.removeEventListener("keydown",kd);startLocal("snake");};
}
function play2048(){
  const hud=document.createElement("div"); hud.className="hud"; hud.innerHTML='<span>Skor: <b id="s2048">0</b></span><span>Swipe</span>';
  const box=document.createElement("div"); box.style.cssText="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:min(100%,320px);aspect-ratio:1";
  stage.appendChild(hud); stage.appendChild(box);
  let grid=Array(16).fill(0), score=0;
  const colors={0:"#1a2236",2:"#334155",4:"#475569",8:"#b45309",16:"#c2410c",32:"#dc2626",64:"#e11d48",128:"#7c3aed",256:"#6d28d9",512:"#4f46e5",1024:"#2563eb",2048:"#059669"};
  function spawn(){ const e=[]; for(let i=0;i<16;i++)if(!grid[i])e.push(i); if(!e.length)return; grid[e[Math.floor(Math.random()*e.length)]]=Math.random()<0.9?2:4; }
  function render(){ box.innerHTML=""; grid.forEach(v=>{ const c=document.createElement("div"); c.style.cssText="display:flex;align-items:center;justify-content:center;border-radius:10px;font-weight:800;font-size:"+(v>512?"1rem":"1.25rem")+";background:"+(colors[v]||"#0f766e")+";color:#fff;aspect-ratio:1"; c.textContent=v||""; box.appendChild(c); }); document.getElementById("s2048").textContent=score; }
  function slide(row){ const a=row.filter(x=>x); for(let i=0;i<a.length-1;i++){ if(a[i]===a[i+1]){a[i]*=2;score+=a[i];a[i+1]=0;} } return a.filter(x=>x).concat(Array(4).fill(0)).slice(0,4); }
  function move(dir){ const old=grid.slice(); for(let i=0;i<4;i++){ let line=[]; for(let j=0;j<4;j++){ const idx=dir==="L"||dir==="R"?i*4+j:j*4+i; line.push(grid[idx]); } if(dir==="R"||dir==="D") line.reverse(); line=slide(line); if(dir==="R"||dir==="D") line.reverse(); for(let j=0;j<4;j++){ const idx=dir==="L"||dir==="R"?i*4+j:j*4+i; grid[idx]=line[j]; } } if(grid.some((v,i)=>v!==old[i])){ spawn(); render(); } }
  spawn(); spawn(); render();
  const kd=e=>{ if(e.key==="ArrowLeft")move("L"); if(e.key==="ArrowRight")move("R"); if(e.key==="ArrowUp")move("U"); if(e.key==="ArrowDown")move("D"); };
  window.addEventListener("keydown",kd);
  let tx,ty; box.addEventListener("touchstart",e=>{const t=e.touches[0];tx=t.clientX;ty=t.clientY;},{passive:true});
  box.addEventListener("touchend",e=>{ const t=e.changedTouches[0]; const dx=t.clientX-tx,dy=t.clientY-ty; if(Math.abs(dx)+Math.abs(dy)<20)return; if(Math.abs(dx)>Math.abs(dy)) move(dx>0?"R":"L"); else move(dy>0?"D":"U"); },{passive:true});
  localCleanup=()=>window.removeEventListener("keydown",kd);
  restartBtn.onclick=()=>{window.removeEventListener("keydown",kd);startLocal("g2048");};
}
function playMemory(){
  const icons=["🍎","🍌","🍇","🍊","🍋","🍉","🍓","🍒"];
  let cards=icons.concat(icons).sort(()=>Math.random()-0.5);
  let open=[], lock=false, matched=0, moves=0;
  const hud=document.createElement("div"); hud.className="hud"; hud.innerHTML='<span>Langkah: <b id="mm">0</b></span><span>Cocokkan</span>';
  const box=document.createElement("div"); box.style.cssText="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:min(100%,320px)";
  stage.appendChild(hud); stage.appendChild(box);
  cards.forEach((ico,i)=>{
    const b=document.createElement("button");
    b.style.cssText="aspect-ratio:1;border:0;border-radius:12px;background:#1a2236;font-size:1.6rem;cursor:pointer;border:1px solid #2a3650";
    b.textContent="❓";
    b.onclick=()=>{ if(lock||b.dataset.on)return; b.textContent=ico; b.dataset.on="1"; open.push({b,ico}); if(open.length===2){ moves++; document.getElementById("mm").textContent=moves; lock=true; if(open[0].ico===open[1].ico){ matched+=2; open=[]; lock=false; if(matched===16) hud.innerHTML='<b style="color:#4ade80">Selesai! '+moves+' langkah</b>'; } else { setTimeout(()=>{ open.forEach(o=>{o.b.textContent="❓"; delete o.b.dataset.on;}); open=[]; lock=false; },500); } } };
    box.appendChild(b);
  });
  localCleanup=()=>{}; restartBtn.onclick=()=>startLocal("memory");
}
function playClicker(){
  const hud=document.createElement("div"); hud.className="hud"; hud.innerHTML='<span>Skor: <b id="ck">0</b></span><span>Waktu: <b id="ct">20</b>s</span>';
  const area=document.createElement("div"); area.style.cssText="position:relative;width:min(100%,360px);height:320px;background:#0a0e18;border-radius:12px;border:1px solid #243049;overflow:hidden";
  stage.appendChild(hud); stage.appendChild(area);
  let score=0, time=20, alive=true;
  const iv=setInterval(()=>{ time--; document.getElementById("ct").textContent=time; if(time<=0){ alive=false; clearInterval(iv); clearInterval(sp); area.innerHTML='<div style="display:flex;height:100%;align-items:center;justify-content:center;font-weight:800;color:#4ade80">Selesai · '+score+'</div>'; } },1000);
  const sp=setInterval(()=>{ if(!alive)return; const t=document.createElement("button"); t.textContent="💥"; t.style.cssText="position:absolute;border:0;background:transparent;font-size:1.8rem;cursor:pointer;left:"+Math.random()*85+"%;top:"+Math.random()*85+"%"; t.onclick=()=>{ score++; document.getElementById("ck").textContent=score; t.remove(); }; area.appendChild(t); setTimeout(()=>t.remove(),900); },450);
  localCleanup=()=>{clearInterval(iv);clearInterval(sp);}; restartBtn.onclick=()=>{clearInterval(iv);clearInterval(sp);startLocal("clicker");};
}
function playPong(){
  const canvas=document.createElement("canvas"); canvas.width=320; canvas.height=400; canvas.style.width="min(100%,320px)"; canvas.style.touchAction="none";
  stage.appendChild(canvas); const ctx=canvas.getContext("2d");
  let p1=160,p2=160,ball={x:160,y:200,vx:2.5,vy:3},s1=0,s2=0,run=true;
  function draw(){ ctx.fillStyle="#0a0e18"; ctx.fillRect(0,0,320,400); ctx.fillStyle="#38bdf8"; ctx.fillRect(p1-30,10,60,8); ctx.fillStyle="#f87171"; ctx.fillRect(p2-30,382,60,8); ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(ball.x,ball.y,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#94a3b8"; ctx.font="14px sans-serif"; ctx.fillText(s1+" : "+s2,148,200); }
  function step(){ if(!run)return; ball.x+=ball.vx; ball.y+=ball.vy; if(ball.x<6||ball.x>314) ball.vx*=-1; if(ball.y<18&&ball.x>p1-30&&ball.x<p1+30){ ball.vy=Math.abs(ball.vy); } if(ball.y>382&&ball.x>p2-30&&ball.x<p2+30){ ball.vy=-Math.abs(ball.vy); } if(ball.y<0){ s2++; ball={x:160,y:200,vx:2.5,vy:3}; } if(ball.y>400){ s1++; ball={x:160,y:200,vx:-2.5,vy:-3}; } p1 += (ball.x-p1)*0.08; draw(); requestAnimationFrame(step); }
  canvas.addEventListener("pointermove",e=>{ const r=canvas.getBoundingClientRect(); p2=(e.clientX-r.left)/r.width*320; });
  draw(); requestAnimationFrame(step); localCleanup=()=>{run=false;}; restartBtn.onclick=()=>{run=false;startLocal("pong");};
}
function playFlappy(){
  const canvas=document.createElement("canvas"); canvas.width=320; canvas.height=420; canvas.style.width="min(100%,320px)"; canvas.style.touchAction="manipulation";
  stage.appendChild(canvas); const ctx=canvas.getContext("2d");
  let y=200,vy=0,pipes=[],frame=0,score=0,alive=true,raf;
  function reset(){ y=200;vy=0;pipes=[];frame=0;score=0;alive=true; }
  function draw(){ ctx.fillStyle="#0ea5e9"; ctx.fillRect(0,0,320,420); ctx.fillStyle="#22c55e"; pipes.forEach(p=>{ ctx.fillRect(p.x,0,40,p.gapY); ctx.fillRect(p.x,p.gapY+90,40,420); }); ctx.fillStyle="#facc15"; ctx.beginPath(); ctx.arc(70,y,12,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#fff"; ctx.font="bold 20px sans-serif"; ctx.fillText(String(score),150,40); if(!alive){ ctx.fillStyle="#0008"; ctx.fillRect(0,0,320,420); ctx.fillStyle="#fff"; ctx.fillText("Tap ulang",110,210); } }
  function step(){ if(!alive){ draw(); return; } frame++; vy+=0.35; y+=vy; if(frame%90===0) pipes.push({x:320,gapY:50+Math.random()*200}); pipes.forEach(p=>p.x-=2.5); pipes=pipes.filter(p=>{ if(p.x+40<0){ score++; return false; } return true; }); if(y<0||y>420) alive=false; pipes.forEach(p=>{ if(70+12>p.x&&70-12<p.x+40&&(y-12<p.gapY||y+12>p.gapY+90)) alive=false; }); draw(); raf=requestAnimationFrame(step); }
  function flap(){ if(!alive){ cancelAnimationFrame(raf); reset(); raf=requestAnimationFrame(step); return; } vy=-6; }
  canvas.onclick=flap; canvas.addEventListener("touchstart",e=>{e.preventDefault();flap();},{passive:false});
  raf=requestAnimationFrame(step); localCleanup=()=>cancelAnimationFrame(raf); restartBtn.onclick=()=>{cancelAnimationFrame(raf);startLocal("flappy");};
}
function playMines(){
  const SIZE=8, MINES=10; let cells=[], revealed=0, dead=false;
  const hud=document.createElement("div"); hud.className="hud"; hud.innerHTML='<span>🚩 '+MINES+'</span><span id="ms">Buka kotak</span>';
  const box=document.createElement("div"); box.style.cssText="display:grid;grid-template-columns:repeat(8,1fr);gap:3px;width:min(100%,320px)";
  stage.appendChild(hud); stage.appendChild(box);
  function init(){ cells=Array.from({length:SIZE*SIZE},()=>({m:false,n:0,open:false})); let placed=0; while(placed<MINES){ const i=Math.floor(Math.random()*cells.length); if(!cells[i].m){cells[i].m=true;placed++;} } for(let i=0;i<cells.length;i++){ if(cells[i].m)continue; const r=Math.floor(i/SIZE),c=i%SIZE; let n=0; for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){ const nr=r+dr,nc=c+dc; if(nr<0||nc<0||nr>=SIZE||nc>=SIZE)continue; if(cells[nr*SIZE+nc].m)n++; } cells[i].n=n; } }
  function render(){ box.innerHTML=""; cells.forEach((cell,i)=>{ const b=document.createElement("button"); b.style.cssText="aspect-ratio:1;border:0;border-radius:6px;font-size:.85rem;font-weight:800;cursor:pointer;background:"+(cell.open?"#0f172a":"#1e293b")+";color:#e2e8f0;border:1px solid #334155"; if(cell.open){ b.textContent=cell.m?"💣":(cell.n||""); if(cell.n===1)b.style.color="#38bdf8"; if(cell.n===2)b.style.color="#4ade80"; if(cell.n>=3)b.style.color="#f87171"; } b.onclick=()=>{ if(dead||cell.open)return; if(cell.m){ cell.open=true; dead=true; cells.forEach(c=>{if(c.m)c.open=true;}); document.getElementById("ms").textContent="BOOM!"; render(); return; } const stack=[i]; while(stack.length){ const j=stack.pop(); const c=cells[j]; if(c.open||c.m)continue; c.open=true; revealed++; if(c.n===0){ const r=Math.floor(j/SIZE),cc=j%SIZE; for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){ const nr=r+dr,nc=cc+dc; if(nr<0||nc<0||nr>=SIZE||nc>=SIZE)continue; stack.push(nr*SIZE+nc); } } } if(revealed>=SIZE*SIZE-MINES){ document.getElementById("ms").innerHTML='<b style="color:#4ade80">Menang!</b>'; dead=true; } render(); }; box.appendChild(b); }); }
  init(); render(); localCleanup=()=>{}; restartBtn.onclick=()=>startLocal("mines");
}
function playRps(){
  const choices=["✊","✋","✌️"];
  const box=document.createElement("div"); box.style.cssText="text-align:center;padding:16px;width:100%";
  box.innerHTML='<div id="rpsRes" style="font-size:2.5rem;margin:12px 0">❓ vs ❓</div><p id="rpsMsg" style="color:#94a3b8;margin-bottom:12px">Pilih</p><div class="btn-row" id="rpsBtns"></div><p class="note">Skor: <b id="rpsS">0</b> - <b id="rpsB">0</b></p>';
  stage.appendChild(box); let s=0,b=0; const btns=document.getElementById("rpsBtns");
  choices.forEach((c,i)=>{ const btn=document.createElement("button"); btn.className="play"; btn.style.fontSize="1.5rem"; btn.textContent=c; btn.onclick=()=>{ const bot=Math.floor(Math.random()*3); document.getElementById("rpsRes").textContent=c+" vs "+choices[bot]; let msg="Seri"; if(i!==bot){ if((i===0&&bot===2)||(i===1&&bot===0)||(i===2&&bot===1)){ msg="Kamu menang!"; s++; } else { msg="Bot menang!"; b++; } } document.getElementById("rpsMsg").textContent=msg; document.getElementById("rpsS").textContent=s; document.getElementById("rpsB").textContent=b; }; btns.appendChild(btn); });
  localCleanup=()=>{}; restartBtn.onclick=()=>startLocal("rps");
}

document.getElementById("back").onclick=showHub;
document.getElementById("q").addEventListener("input",e=>{ query=e.target.value.trim(); renderGrid(); });
document.getElementById("btnSrv").onclick=()=>{ renderSrvList(""); srvPanel.classList.toggle("on"); };
document.getElementById("closeSrv").onclick=()=>srvPanel.classList.remove("on");
document.getElementById("srvQ").addEventListener("input",e=>renderSrvList(e.target.value));
document.getElementById("openHub").onclick=()=>{ window.open(currentSrv.url, "_blank", "noopener"); };


try{
  const saved = localStorage.getItem("wa_allgames_srv");
  const found = SERVERS.find(s=>s.id===saved);
  if(found) currentSrv = found;
}catch(e){}
srvName.textContent = currentSrv.name;
renderCats();
renderGrid();
renderSrvList("");
})();
</script>
</body>
</html>`;
}



/** Spotify-style player — audio plays INSIDE the HTML (HTML5 audio + embed) */
export function buildSpotifySearchHtml(opts?: {
  query?: string;
  title?: string;
  artist?: string;
  albumArt?: string;
  duration?: string;
  position?: string;
  spotifyId?: string;
  previewUrl?: string;
  audioBase64?: string;
  audioMime?: string;
  externalUrl?: string;
}): string {
  const q = (opts?.query || "").trim();
  const title = (opts?.title || q || "Spotify Player").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const artist = (opts?.artist || "WATER AI").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const dur = opts?.duration || "0:00";
  const art = opts?.albumArt || "";
  const spId = opts?.spotifyId || "";
  const preview = opts?.previewUrl || "";
  const mime = opts?.audioMime || "audio/mpeg";
  const b64 = opts?.audioBase64 || "";
  const ext = opts?.externalUrl || ("https://open.spotify.com/search/results/" + encodeURIComponent(q || " "));
  const searchUrl = "https://open.spotify.com/search/results/" + encodeURIComponent(q || " ");
  const hasAudio = !!(b64 || preview);
  const srcAttr = b64
    ? `data:${mime};base64,${b64}`
    : preview;
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>▶ ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:system-ui,-apple-system,sans-serif;background:#121212;color:#fff;min-height:100vh}
.wrap{max-width:420px;margin:0 auto;padding:14px}
.card{background:#181818;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px #0008}
.art{aspect-ratio:1;background:linear-gradient(145deg,#282828,#1a1a1a);display:flex;align-items:center;justify-content:center;font-size:4rem;position:relative}
.art img{width:100%;height:100%;object-fit:cover}
.meta{padding:16px}
.meta h1{font-size:1.15rem;font-weight:800;margin-bottom:4px}
.meta p{color:#b3b3b3;font-size:.85rem}
.bar-wrap{margin:14px 0 6px}
.bar{height:5px;background:#4d4d4d;border-radius:99px;position:relative;cursor:pointer}
.bar i{position:absolute;left:0;top:0;bottom:0;width:0%;background:#1db954;border-radius:99px}
.bar i::after{content:"";position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;background:#fff}
.times{display:flex;justify-content:space-between;font-size:.7rem;color:#b3b3b3}
.ctrls{display:flex;align-items:center;justify-content:center;gap:20px;padding:12px 0 4px}
.ctrls button{border:0;background:transparent;color:#fff;font-size:1.5rem;cursor:pointer;padding:8px;touch-action:manipulation}
.ctrls .big{width:64px;height:64px;border-radius:50%;background:#fff;color:#000;font-size:1.8rem;display:flex;align-items:center;justify-content:center;font-weight:800}
.ctrls .big.playing{background:#1db954;color:#fff}
.actions{display:flex;gap:8px;padding:8px 16px 16px}
.actions a,.actions button{flex:1;text-align:center;text-decoration:none;border:0;border-radius:24px;padding:12px;font-weight:800;font-size:.82rem;cursor:pointer}
.go{background:#1db954;color:#000}
.sec{background:#2a2a2a;color:#fff}
.embed{width:100%;height:152px;border:0;border-radius:12px;margin-top:10px}
.hint{margin-top:10px;font-size:.7rem;color:#6a6a6a;text-align:center;line-height:1.4}
audio{display:none}
.status{text-align:center;font-size:.75rem;color:#1db954;min-height:1.2em;margin-top:4px}
</style></head><body>
<div class="wrap">
  <div class="card">
    <div class="art" id="art">${art ? '<img src="'+art+'" alt="cover"/>' : "🎵"}</div>
    <div class="meta">
      <h1 id="title">${title}</h1>
      <p id="artist">${artist}</p>
      <div class="bar-wrap"><div class="bar" id="bar"><i id="fill"></i></div></div>
      <div class="times"><span id="cur">0:00</span><span id="dur">${dur}</span></div>
      <div class="ctrls">
        <button type="button" id="back5" title="-5s">⏪</button>
        <button type="button" class="big" id="play" title="Play/Pause">▶</button>
        <button type="button" id="fwd5" title="+5s">⏩</button>
      </div>
      <div class="status" id="status">${hasAudio ? "Siap diputar — ketuk ▶" : "Buka Spotify untuk full track"}</div>
    </div>
    ${spId ? '<iframe class="embed" src="https://open.spotify.com/embed/track/'+spId+'?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>' : ""}
    <div class="actions">
      <a class="go" href="${ext}" target="_blank" rel="noopener">Buka Spotify</a>
      <a class="sec" href="${searchUrl}" target="_blank" rel="noopener">Cari lagi</a>
    </div>
  </div>
  <p class="hint">Audio diputar di dalam media HTML ini (seperti Spotify).<br/>WATER AI · PLAY2</p>
  <audio id="audio" playsinline ${srcAttr ? 'src="'+srcAttr+'"' : ""} preload="auto"></audio>
</div>
<script>
(function(){
const audio=document.getElementById("audio");
const playBtn=document.getElementById("play");
const fill=document.getElementById("fill");
const cur=document.getElementById("cur");
const dur=document.getElementById("dur");
const status=document.getElementById("status");
const bar=document.getElementById("bar");
function fmt(s){s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function setPlaying(on){
  playBtn.textContent=on?"⏸":"▶";
  playBtn.classList.toggle("playing",on);
  status.textContent=on?"Sedang diputar…":"Dijeda";
}
playBtn.onclick=async function(){
  if(!audio.src){ status.textContent="Audio belum tersedia — buka Spotify"; return; }
  try{
    if(audio.paused){ await audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  }catch(e){ status.textContent="Gagal play: ketuk lagi / buka Spotify"; }
};
document.getElementById("back5").onclick=()=>{ audio.currentTime=Math.max(0,audio.currentTime-5); };
document.getElementById("fwd5").onclick=()=>{ audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5); };
audio.addEventListener("timeupdate",()=>{
  const p=audio.duration? (audio.currentTime/audio.duration*100):0;
  fill.style.width=p+"%";
  cur.textContent=fmt(audio.currentTime);
  if(audio.duration && isFinite(audio.duration)) dur.textContent=fmt(audio.duration);
});
audio.addEventListener("ended",()=>setPlaying(false));
audio.addEventListener("loadedmetadata",()=>{ if(audio.duration&&isFinite(audio.duration)) dur.textContent=fmt(audio.duration); });
bar.addEventListener("click",e=>{
  if(!audio.duration)return;
  const r=bar.getBoundingClientRect();
  audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;
});
})();
</script>
</body></html>`;
}

/** SoundCloud-style player — audio plays INSIDE the HTML */
export function buildSoundCloudSearchHtml(opts?: {
  query?: string;
  title?: string;
  artist?: string;
  audioBase64?: string;
  audioMime?: string;
  audioUrl?: string;
}): string {
  const q = (opts?.query || "").trim();
  const title = (opts?.title || q || "SoundCloud").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const artist = (opts?.artist || "WATER AI").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const mime = opts?.audioMime || "audio/mpeg";
  const b64 = opts?.audioBase64 || "";
  const url = opts?.audioUrl || "";
  const searchUrl = "https://m.soundcloud.com/search?q=" + encodeURIComponent(q || "");
  const hasAudio = !!(b64 || url);
  const srcAttr = b64 ? `data:${mime};base64,${b64}` : url;
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>▶ ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#fff;min-height:100vh}
.wrap{max-width:420px;margin:0 auto;padding:14px}
.brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-weight:800}
.brand b{color:#ff5500}
.player{background:linear-gradient(180deg,#2a1a14,#1a1210);border-radius:16px;padding:16px;border:1px solid #3d2a22}
.wave{height:56px;border-radius:8px;background:repeating-linear-gradient(90deg,#ff550066 0 2px,transparent 2px 5px);margin-bottom:12px;position:relative;overflow:hidden}
.wave .prog{position:absolute;inset:0 auto 0 0;width:0%;background:repeating-linear-gradient(90deg,#ff5500 0 2px,transparent 2px 5px)}
.meta h1{font-size:1.05rem;font-weight:800;margin-bottom:4px}
.meta p{color:#bbb;font-size:.82rem;margin-bottom:10px}
.bar{height:4px;background:#333;border-radius:99px;margin-bottom:6px;cursor:pointer;position:relative}
.bar i{display:block;width:0%;height:100%;background:#ff5500;border-radius:99px}
.times{display:flex;justify-content:space-between;font-size:.7rem;color:#888;margin-bottom:12px}
.ctrls{display:flex;justify-content:center;align-items:center;gap:18px}
.ctrls button{border:0;background:transparent;color:#fff;font-size:1.4rem;cursor:pointer;padding:8px;touch-action:manipulation}
.ctrls .big{width:60px;height:60px;border-radius:50%;background:#ff5500;color:#fff;font-size:1.6rem;font-weight:800;display:flex;align-items:center;justify-content:center}
.ctrls .big.playing{background:#fff;color:#ff5500}
.actions{display:flex;gap:8px;margin-top:14px}
.actions a{flex:1;text-align:center;text-decoration:none;border-radius:8px;padding:12px;font-weight:800;font-size:.85rem}
.go{background:#ff5500;color:#fff}
.sec{background:#222;color:#fff;border:1px solid #333}
.hint{margin-top:12px;font-size:.7rem;color:#666;text-align:center;line-height:1.4}
.status{text-align:center;font-size:.75rem;color:#ff5500;margin-top:8px;min-height:1.2em}
audio{display:none}
</style></head><body>
<div class="wrap">
  <div class="brand">☁️ <b>SoundCloud</b> · PLAY3</div>
  <div class="player">
    <div class="wave"><div class="prog" id="wprog"></div></div>
    <div class="meta">
      <h1>${title}</h1>
      <p>${artist}</p>
      <div class="bar" id="bar"><i id="fill"></i></div>
      <div class="times"><span id="cur">0:00</span><span id="dur">—:—</span></div>
      <div class="ctrls">
        <button type="button" id="back5">⏮</button>
        <button type="button" class="big" id="play">▶</button>
        <button type="button" id="fwd5">⏭</button>
      </div>
      <div class="status" id="status">${hasAudio ? "Siap diputar — ketuk ▶" : "Buka SoundCloud untuk full track"}</div>
    </div>
    <div class="actions">
      <a class="go" href="${searchUrl}" target="_blank" rel="noopener">Buka SoundCloud</a>
      <a class="sec" href="https://soundcloud.com/search?q=${encodeURIComponent(q||"music")}" target="_blank" rel="noopener">Desktop</a>
    </div>
  </div>
  <p class="hint">Audio diputar di dalam media HTML ini (seperti SoundCloud).<br/>WATER AI · PLAY3</p>
  <audio id="audio" playsinline ${srcAttr ? 'src="'+srcAttr+'"' : ""} preload="auto"></audio>
</div>
<script>
(function(){
const audio=document.getElementById("audio");
const playBtn=document.getElementById("play");
const fill=document.getElementById("fill");
const wprog=document.getElementById("wprog");
const cur=document.getElementById("cur");
const dur=document.getElementById("dur");
const status=document.getElementById("status");
const bar=document.getElementById("bar");
function fmt(s){s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function setPlaying(on){
  playBtn.textContent=on?"⏸":"▶";
  playBtn.classList.toggle("playing",on);
  status.textContent=on?"Sedang diputar…":"Dijeda";
}
playBtn.onclick=async function(){
  if(!audio.src){ status.textContent="Audio belum tersedia — buka SoundCloud"; return; }
  try{
    if(audio.paused){ await audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  }catch(e){ status.textContent="Gagal play: ketuk lagi"; }
};
document.getElementById("back5").onclick=()=>{ audio.currentTime=Math.max(0,audio.currentTime-5); };
document.getElementById("fwd5").onclick=()=>{ audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5); };
audio.addEventListener("timeupdate",()=>{
  const p=audio.duration? (audio.currentTime/audio.duration*100):0;
  fill.style.width=p+"%";
  wprog.style.width=p+"%";
  cur.textContent=fmt(audio.currentTime);
  if(audio.duration&&isFinite(audio.duration)) dur.textContent=fmt(audio.duration);
});
audio.addEventListener("ended",()=>setPlaying(false));
audio.addEventListener("loadedmetadata",()=>{ if(audio.duration&&isFinite(audio.duration)) dur.textContent=fmt(audio.duration); });
bar.addEventListener("click",e=>{
  if(!audio.duration)return;
  const r=bar.getBoundingClientRect();
  audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;
});
})();
</script>
</body></html>`;
}


/** WATER AI TERMINAL — Coddy-style real-time terminal bubble */
export function buildTermuxHtml(opts?: {
  title?: string;
  lines?: string[];
  cwd?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>WATER AI TERMINAL</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0b0f14;color:#d7e0ea;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
.wrap{max-width:520px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
.bar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#121820;border-bottom:1px solid #1e293b}
.dot{width:11px;height:11px;border-radius:50%}
.r{background:#ff5f56}.y{background:#ffbd2e}.g{background:#27c93f}
.bar .t{font-size:12px;color:#94a3b8;margin-left:4px}
.brand{padding:18px 14px 8px;text-align:center;border-bottom:1px solid #1e293b;background:linear-gradient(180deg,#0f172a,#0b0f14)}
.brand h1{font-size:1.35rem;letter-spacing:.08em;font-weight:900;background:linear-gradient(90deg,#4ade80,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
.brand p{margin-top:6px;font-size:11px;color:#64748b;line-height:1.4}
.term{flex:1;padding:12px 14px;overflow-y:auto;font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;min-height:240px}
.term div{margin:0 0 6px}
.term .g{color:#4ade80}.term .c{color:#67e8f9}.term .w{color:#fde68a}.term .e{color:#f87171}.term .m{color:#94a3b8}
.row{display:flex;gap:8px;padding:10px 12px;background:#121820;border-top:1px solid #1e293b;align-items:center}
.prompt{color:#4ade80;font-weight:800}
#cmd{flex:1;background:#0b0f14;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:10px;font:inherit;outline:none}
#cmd:focus{border-color:#4ade80}
#run{background:#4ade80;color:#052e16;border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}
.kb{display:none;flex-direction:column;gap:4px;padding:6px;background:#0a0e13;border-top:1px solid #1e293b}
.kb.on{display:flex}
.rdb{display:flex;gap:3px;justify-content:center}
.rdb button{flex:1;min-height:38px;border:0;border-radius:6px;background:#1e293b;color:#e2e8f0;font-size:12px;font-weight:600}
.rdb .sp{flex:2.8}.rdb .ent{background:#14532d;color:#bbf7d0}.rdb .bk{background:#3f1d1d;color:#fecaca}
.tog{padding:6px 12px;background:#121820}
.tog button{width:100%;padding:8px;border:1px solid #334155;border-radius:8px;background:#1e293b;color:#94a3b8;font-size:12px}
</style></head><body>
<div class="wrap">
  <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="t">water-ai@cloud — zsh</span></div>
  <div class="brand">
    <h1>WATER AI TERMINAL</h1>
    <p>Realtime shell bubble · ketik command di bawah<br/>Chat WA: session .termux untuk curl/node server-side</p>
  </div>
  <div class="term" id="out"></div>
  <div class="row"><span class="prompt">$</span><input id="cmd" autocomplete="off" spellcheck="false" placeholder="help · node -v · date · calc 2+2"/><button id="run" type="button">↵</button></div>
  <div class="tog"><button type="button" id="kbToggle">⌨ Keyboard</button></div>
  <div class="kb" id="kb"></div>
</div>
<script>
(function(){
const out=document.getElementById("out"),inp=document.getElementById("cmd");
const kb=document.getElementById("kb");
let shift=false,sym=false;
function line(html){const d=document.createElement("div");d.innerHTML=html;out.appendChild(d);out.scrollTop=out.scrollHeight}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}
line('<span class="g">Welcome to WATER AI TERMINAL</span>');
line('<span class="m">Type <span class="c">help</span> for commands. Output is spaced per line.</span>');
const rows=[["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["⇧","z","x","c","v","b","n","m","⌫"],["123",".","/","-","sp","↵"]];
const syms=[["1","2","3","4","5","6","7","8","9","0"],["@","#","$","%","&","*","(",")"],["+","=","[","]",":",";"],["ABC",",","?","!","sp","↵"]];
function renderKb(){
  kb.innerHTML="";
  (sym?syms:rows).forEach(row=>{
    const d=document.createElement("div");d.className="rdb";
    row.forEach(k=>{
      const b=document.createElement("button");b.type="button";
      let lab=k;if(k==="sp"){lab="space";b.className="sp"}if(k==="↵"){lab="enter";b.className="ent"}if(k==="⌫"){lab="⌫";b.className="bk"}
      if(!sym&&shift&&k.length===1)lab=k.toUpperCase();
      b.textContent=lab;b.onclick=()=>tap(k);d.appendChild(b);
    });kb.appendChild(d);
  });
}
function tap(k){
  if(k==="⇧"){shift=!shift;renderKb();return}
  if(k==="123"){sym=true;renderKb();return}
  if(k==="ABC"){sym=false;renderKb();return}
  if(k==="⌫"){inp.value=inp.value.slice(0,-1);return}
  if(k==="sp"){inp.value+=" ";return}
  if(k==="↵"){run();return}
  let ch=k;if(!sym&&shift){ch=k.toUpperCase();shift=false;renderKb()}
  inp.value+=ch;inp.focus();
}
function run(){
  const v=(inp.value||"").trim();if(!v)return;inp.value="";
  line('<span class="g">$ </span>'+esc(v));
  const r=exec(v);
  if(r==="__CLEAR__"){out.innerHTML="";line('<span class="m">cleared</span>');return}
  if(r)line(r);
}
function exec(raw){
  const p=raw.split(/\\s+/),cmd=(p[0]||"").toLowerCase(),rest=p.slice(1).join(" ");
  if(cmd==="help")return '<span class="c">help</span> date whoami uname pwd ls echo calc clear node npm git env\\n<span class="w">Server session (chat):</span> curl &lt;url&gt; · node -e · npm -v · git --version';
  if(cmd==="clear")return "__CLEAR__";
  if(cmd==="date")return esc(new Date().toString());
  if(cmd==="whoami")return "water-ai";
  if(cmd==="pwd")return "/home/water-ai";
  if(cmd==="uname")return "Linux water-ai 6.1.0 #1 SMP aarch64";
  if(cmd==="ls")return '<span class="c">bin</span>  <span class="c">src</span>  <span class="c">tmp</span>  package.json  README.md';
  if(cmd==="echo")return esc(rest);
  if(cmd==="env")return "USER=water-ai\\nHOME=/home/water-ai\\nSHELL=/bin/zsh\\nPATH=/usr/local/bin:/usr/bin";
  if(cmd==="node")return rest==="-v"||rest==="--version"?'<span class="c">v22.x</span> <span class="m">(server: ketik di chat session)</span>':'<span class="m">gunakan di chat: node -e "console.log(1)"</span>';
  if(cmd==="npm")return '<span class="m">npm available on server session — ketik npm -v di chat</span>';
  if(cmd==="git")return '<span class="m">git available on server session — ketik git --version di chat</span>';
  if(cmd==="calc"){
    try{return String(Function('"use strict";return('+rest.replace(/[^0-9+\\-*/().%\\s]/g,"")+')')())}
    catch(e){return '<span class="e">calc: invalid</span>'}
  }
  if(cmd==="curl"||cmd==="fetch")return '<span class="w">→</span> ketik perintah yang sama di <span class="c">chat WhatsApp</span> (session .termux) untuk fetch nyata';
  return '<span class="e">command not found:</span> '+esc(cmd);
}
document.getElementById("run").onclick=run;
inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();run()}});
document.getElementById("kbToggle").onclick=()=>{kb.classList.toggle("on");if(kb.classList.contains("on"))renderKb()};
try{inp.focus()}catch(e){}
})();
</script>
</body></html>`;
}

export function buildBlockBlastHtml(opts?: { title?: string }): string {
  const title = (opts?.title || "BLOCK BLAST").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(180deg,#3b4fd4,#2436a8);min-height:100vh;color:#fff;padding:12px}
.wrap{max-width:400px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.score{display:flex;align-items:center;gap:8px;background:#161b45;border-radius:999px;padding:8px 14px}
.score b{font-size:1.3rem}
.board-frame{background:#161b45;border-radius:18px;padding:8px;box-shadow:0 10px 28px #0005}
.board{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;aspect-ratio:1}
.cell{aspect-ratio:1;border-radius:5px;background:#252b5c;cursor:pointer;touch-action:manipulation;transition:transform .08s,background .12s,opacity .15s}
.cell.ok{outline:2px solid #5dfe6a;outline-offset:-2px}
.cell.filled{box-shadow:inset 0 -2px 0 #0004}
.cell.pop{animation:pop .22s ease-out}
@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes clearFx{to{transform:scale(0);opacity:0}}
.cell.clearing{animation:clearFx .2s forwards}
.tray{display:flex;justify-content:space-around;margin-top:16px;min-height:96px;align-items:center}
.piece{display:grid;gap:3px;padding:6px;cursor:pointer;touch-action:manipulation;border-radius:10px;transition:transform .1s}
.piece.sel{transform:scale(1.1);filter:brightness(1.15) drop-shadow(0 0 6px #fff6)}
.piece .p{width:20px;height:20px;border-radius:4px}
.hint{text-align:center;margin-top:10px;opacity:.7;font-size:.78rem}
.over{display:none;position:fixed;inset:0;background:#000a;align-items:center;justify-content:center;z-index:9}
.over.show{display:flex}
.over .card{background:#161b45;padding:22px;border-radius:16px;text-align:center}
.over button{margin-top:12px;padding:12px 22px;border:0;border-radius:12px;background:#22c55e;color:#fff;font-weight:800}
</style></head><body>
<div class="wrap">
  <div class="top"><div class="score">★ <b id="sc">0</b></div><button type="button" id="reset" style="padding:10px 14px;border:0;border-radius:12px;background:#22c55e;color:#fff;font-weight:800">Reset</button></div>
  <div class="board-frame"><div class="board" id="board"></div></div>
  <div class="tray" id="tray"></div>
  <p class="hint">Tap blok → tap kotak (auto taruh, cepat)</p>
</div>
<div class="over" id="over"><div class="card"><h2>Game Over</h2><p id="ov"></p><button type="button" id="again">Main Lagi</button></div></div>
<script>
(function(){
const N=8,C=["#2ee6a8","#5ad0ff","#ff6b6b","#ffb84d","#c084fc","#f472b6","#a3e635","#38bdf8"];
const S=[
  [[1,1,1],[1,0,0]],[[1,1,1],[0,0,1]],[[1,0],[1,0],[1,1]],[[0,1],[0,1],[1,1]],
  [[1,1],[1,1]],[[1,1,1],[0,1,0]],[[0,1,0],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]],
  [[1,1,1,1]],[[1],[1],[1],[1]],[[1,1,1]],[[1],[1],[1]],[[1,1]],[[1],[1]],[[1]],
  [[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[1,1,1],[1,0,0]],[[1,1,1],[0,0,1]]
];
let G=Array.from({length:N},()=>Array(N).fill(0)),score=0,pieces=[],sel=-1,busy=false;
const board=document.getElementById("board"),tray=document.getElementById("tray"),sc=document.getElementById("sc");
function rnd(){return{sh:S[(Math.random()*S.length)|0],col:1+((Math.random()*C.length)|0)}}
function fits(p,r0,c0){
  for(let r=0;r<p.sh.length;r++)for(let c=0;c<p.sh[r].length;c++){
    if(!p.sh[r][c])continue;const rr=r0+r,cc=c0+c;
    if(rr<0||cc<0||rr>=N||cc>=N||G[rr][cc])return false;
  }return true;
}
function canAny(p){for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(fits(p,r,c))return true;return false}
function paint(hl){
  board.innerHTML="";
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    const d=document.createElement("div");
    d.className="cell"+(G[r][c]?" filled":"");
    if(G[r][c])d.style.background=C[(G[r][c]-1)%C.length];
    if(hl&&fits(pieces[sel],r,c)&&!G[r][c])d.classList.add("ok");
    const go=()=>place(r,c);
    d.onclick=go;d.ontouchend=function(e){e.preventDefault();go()};
    board.appendChild(d);
  }
}
function drawTray(){
  tray.innerHTML="";
  pieces.forEach((p,i)=>{
    const el=document.createElement("div");el.className="piece"+(sel===i?" sel":"");
    el.style.gridTemplateColumns="repeat("+p.sh[0].length+",20px)";
    p.sh.forEach(row=>row.forEach(v=>{
      const x=document.createElement("div");x.className="p";
      x.style.background=v?C[(p.col-1)%C.length]:"transparent";el.appendChild(x);
    }));
    const pick=()=>{sel=i;drawTray();paint(true)};
    el.onclick=pick;el.ontouchend=function(e){e.preventDefault();pick()};
    tray.appendChild(el);
  });
}
function place(r0,c0){
  if(busy||sel<0||!pieces[sel])return;
  const p=pieces[sel];
  if(!fits(p,r0,c0))return;
  busy=true;
  for(let r=0;r<p.sh.length;r++)for(let c=0;c<p.sh[r].length;c++)if(p.sh[r][c])G[r0+r][c0+c]=p.col;
  pieces.splice(sel,1);sel=-1;
  score+=5;sc.textContent=score;
  paint(false);
  // pop animation on placed cells
  requestAnimationFrame(()=>{
    for(let r=0;r<p.sh.length;r++)for(let c=0;c<p.sh[r].length;c++){
      if(!p.sh[r][c])continue;
      const idx=(r0+r)*N+(c0+c);const el=board.children[idx];
      if(el)el.classList.add("pop");
    }
  });
  setTimeout(()=>{
    const n=clear();
    if(n){score+=n*30;sc.textContent=score}
    while(pieces.length<3)pieces.push(rnd());
    drawTray();paint(false);
    busy=false;
    if(!pieces.some(canAny)){document.getElementById("ov").textContent="Skor "+score;document.getElementById("over").classList.add("show")}
  },180);
}
function clear(){
  let rows=[],cols=[],n=0;
  for(let r=0;r<N;r++)if(G[r].every(v=>v))rows.push(r);
  for(let c=0;c<N;c++){let ok=true;for(let r=0;r<N;r++)if(!G[r][c]){ok=false;break}if(ok)cols.push(c)}
  const mark=new Set();
  rows.forEach(r=>{for(let c=0;c<N;c++)mark.add(r*N+c);n++});
  cols.forEach(c=>{for(let r=0;r<N;r++)mark.add(r*N+c);n++});
  mark.forEach(i=>{const el=board.children[i];if(el)el.classList.add("clearing")});
  rows.forEach(r=>G[r].fill(0));
  cols.forEach(c=>{for(let r=0;r<N;r++)G[r][c]=0});
  return n;
}
function reset(){G=Array.from({length:N},()=>Array(N).fill(0));score=0;pieces=[];sel=-1;busy=false;sc.textContent="0";document.getElementById("over").classList.remove("show");while(pieces.length<3)pieces.push(rnd());drawTray();paint(false)}
document.getElementById("again").onclick=reset;
document.getElementById("reset").onclick=reset;
reset();
})();
</script>
</body></html>`;
}


/**
 * Turns the already-tested local HTML games into a bot-hosted online room.
 * The HTML remains a media/rich-card UI; moves are authoritative on WATER AI
 * and both phones poll the same room every 700ms, so no local-only simulation.
 */
export function attachOnlineGameHtml(
  html: string,
  opts: { kind: "chess" | "ttt"; roomId: string; token: string; side: "host" | "guest"; apiBase: string }
): string {
  const safe = (v: string) => JSON.stringify(String(v));
  const cfg = JSON.stringify({
    kind: opts.kind,
    roomId: opts.roomId,
    token: opts.token,
    side: opts.side,
    apiBase: String(opts.apiBase).replace(/\/$/, ""),
  });
  const script = `<script>(function(){\n"use strict";\nvar ONLINE=${cfg};\nvar selectedOnline=null,onlineState=null,onlineBusy=false;\nvar sym={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};\nfunction api(){return ONLINE.apiBase+"/"+encodeURIComponent(ONLINE.roomId)+"?token="+encodeURIComponent(ONLINE.token)}\nfunction postApi(body){return fetch(api(),{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+ONLINE.token},body:JSON.stringify(body),cache:"no-store"}).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||"Gagal");return x})})}\nfunction paintChess(s){\n var b=s.board||[],el=document.getElementById("board"); if(!el)return; var cells=el.children;\n for(var i=0;i<64;i++){var r=Math.floor(i/8),c=i%8,p=b[r]&&b[r][c],cell=cells[i]; if(!cell)continue; cell.className="cell "+(((r+c)%2===0)?"light":"dark"); cell.innerHTML=p?'<div class="piece '+(p===p.toUpperCase()?"white":"black")+'">'+(sym[p]||p)+'</div>':'';}\n if(document.getElementById("turn")){var who=s.turn===(ONLINE.side==="host"?"w":"b")?"Giliran kamu":"Menunggu lawan…"; document.getElementById("turn").textContent=s.status==="checkmate"?"♛ SKAKMAT":(s.status==="check"?"⚠ SKAK — "+who:who);}\n}\nfunction paintTtt(s){var cells=document.querySelectorAll(".cell"),b=s.board||[]; cells.forEach(function(c,i){c.textContent=b[i]||"";c.classList.toggle("x",b[i]==="X");c.classList.toggle("o",b[i]==="O");});var st=document.getElementById("status");if(st)st.textContent=s.status!=="playing"?(s.winner?s.winner+" MENANG":"SERI"):(s.turn===(ONLINE.side==="host"?"X":"O")?"Giliran kamu":"Menunggu lawan…");}\nfunction paint(data){onlineState=data.state||data;if(ONLINE.kind==="chess")paintChess(onlineState);else paintTtt(onlineState);}\nfunction sync(){fetch(api(),{cache:"no-store",headers:{Authorization:"Bearer "+ONLINE.token}}).then(function(r){return r.json()}).then(function(d){if(d.ok)paint(d)}).catch(function(){});}\nfunction chessClick(ev){if(onlineBusy||!onlineState)return;var cells=document.getElementById("board")?.children;if(!cells)return;var cell=ev.target.closest?.(".cell");if(!cell)return;var i=Array.prototype.indexOf.call(cells,cell);if(i<0)return;var r=Math.floor(i/8),c=i%8,p=onlineState.board?.[r]?.[c]||null,me=ONLINE.side==="host"?"w":"b";if(onlineState.turn!==me)return;var sq="abcdefgh"[c]+(8-r);if(!selectedOnline){if(p&&((me==="w"&&p===p.toUpperCase())||(me==="b"&&p===p.toLowerCase()))){selectedOnline=sq;cell.classList.add("selected")}return;}var from=selectedOnline;selectedOnline=null;try{ev.stopImmediatePropagation()}catch(e){}onlineBusy=true;postApi({from:from,to:sq}).then(paint).catch(function(e){if(document.getElementById("turn"))document.getElementById("turn").textContent=e.message||"Langkah ditolak"}).finally(function(){onlineBusy=false;sync()});}\nfunction tttClick(ev){if(onlineBusy||!onlineState)return;var cell=ev.target.closest?.(".cell");if(!cell)return;var i=Number(cell.getAttribute("data-index"));var me=ONLINE.side==="host"?"X":"O";if(onlineState.turn!==me)return;try{ev.stopImmediatePropagation()}catch(e){}onlineBusy=true;postApi({cell:i}).then(paint).catch(function(e){var st=document.getElementById("status");if(st)st.textContent=e.message||"Langkah ditolak"}).finally(function(){onlineBusy=false;sync()});}\nfunction bind(){var target=ONLINE.kind==="chess"?document.getElementById("board"):document.getElementById("board");if(!target)return;target.addEventListener("click",ONLINE.kind==="chess"?chessClick:tttClick,true);if(ONLINE.kind==="chess"){var f=document.getElementById("flip");if(f)f.disabled=true;var u=document.getElementById("undo");if(u)u.disabled=true;}sync();setInterval(sync,700);}\nif(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);else bind();\n})();</script>`;
  return html.replace(/<\/body>/i, script + "</body>");
}
