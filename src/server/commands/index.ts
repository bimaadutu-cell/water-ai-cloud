/* WATER AI command dispatcher — maps registry handler names to real
 * implementations. Every function returns a real result (text or media)
 * or throws CmdError with an honest message. */
import type { CmdCtx, CmdResult } from "./core";
import * as info from "./info";
import * as ai from "./ai";
import * as media from "./media";
import * as dl from "./downloader";
import * as grp from "./group";

export type Handler = (ctx: CmdCtx) => Promise<CmdResult>;

const H: Record<string, Handler> = {
  /*  INFORMATION */
  menu: info.menu,
  allmenu: info.allmenu,
  help: info.help,
  status: info.status,
  ping: info.ping,
  runtime: info.runtime,
  stats: info.status,
  botinfo: info.botinfo,
  owner: info.owner,
  copymenu: info.copymenu,

  /* 🧰 TOOLS */
  calc: info.calc,
  json: info.jsonCmd,
  base64: info.base64,
  urlencode: info.urlencode,
  urldecode: info.urldecode,
  uuid: info.uuidCmd,
  hash: info.hash,
  regex: info.regex,
  timestamp: info.timestamp,
  color: info.color,
  jwt: info.jwt,
  html: info.html,
  javascript: info.javascript,

  /* 💎 PREMIUM */
  premium: info.premium,
  mypremium: info.mypremium,
  limit: info.limit,
  premiuminfo: info.premiuminfo,
  buy: info.buy,

  /* 🎮 FUN */
  quiz: info.quiz,
  trivia: info.trivia,
  tebakkata: info.tebakkata,
  tebakgambar: info.tebakgambar,
  random: info.random,
  quote: info.quote,
  daily: info.daily,
  leaderboard: info.leaderboard,
  flashcard: info.flashcard,

  /* 🤖 AI */
  ai: ai.ai,
  ask: ai.ask,
  question: ai.question,
  study: ai.study,
  study2: ai.study,
  summarize: ai.summarize,
  summary: ai.summarize,
  rewrite: ai.rewrite,
  prompt: ai.prompt,
  code: ai.code,
  translate: ai.translate,
  vision: ai.vision,
  ocr: ai.ocr,
  brat: media.brat,

  /* 📚 EDUCATION */
  math: info.math,
  physics: ai.physics,
  chemistry: ai.chemistry,

  /* 🔎 SEARCH */
  search: ai.searchCmd,
  image: ai.imageSearch,
  news: ai.news,
  wikipedia: ai.wikipedia,
  movie: ai.movie,
  anime: ai.anime,
  manga: ai.manga,
  github: ai.github,
  dictionary: ai.dictionary,
  weather: ai.weather,

  /* 🎨 STICKER */
  sticker: media.sticker,
  s: media.sticker,
  stiker: media.sticker,
  toimg: media.toimg,
  textsticker: media.textsticker,
  videosticker: media.videosticker,
  gifsticker: media.gifsticker,
  stickersearch: media.stickersearch,
  randomsticker: media.randomsticker,
  smeme: media.smeme,
  rvo: media.rvo,
  stickerinfo: media.stickerinfo,

  /* 🅱️ BRAT */
  bratsticker: media.bratsticker,
  bratgif: media.bratgif,
  bratvideo: media.bratvideo,
  bratvid: media.bratvid,

  /* 🖼️ IMAGE */
  react: grp.react,
  removebg: media.removebg,
  enhance: media.enhance,
  upscale: media.upscale,
  compress: media.compress,
  resize: media.resize,
  crop: media.crop,
  rotate: media.rotate,
  flip: media.flip,
  blur: media.blur,
  sharpen: media.sharpen,
  grayscale: media.grayscale,
  watermark: media.watermark,
  imginfo: media.imginfo,

  /* 🎬 MEDIA */
  tomp3: media.tomp3,
  toaudio: media.toaudio,
  tovoice: media.tovoice,
  togif: media.togif,
  topdf: media.topdf,
  toimage: media.toimg,
  convert: media.convert,
  mediainfo: media.mediainfo,
  thumbnail: media.thumbnail,

  /* 📥 DOWNLOADER */
  play: dl.play,
  allvid: dl.allvid,
  song: dl.song,
  audio: dl.audioCmd,
  video: dl.video,
  tiktok: dl.tiktok,
  instagram: dl.instagram,
  youtube: dl.youtube,
  media: dl.media,

  /* 👥 GROUP */
  groupinfo: grp.groupinfo,
  admin: grp.admin,
  tagall: grp.tagall,
  hidetag: grp.hidetag,
  mention: grp.mention,
  add: grp.addMember,
  kick: grp.kick,
  promote: grp.promote,
  demote: grp.demote,
  warn: grp.warn,
  warnings: grp.warnings,
  mute: grp.mute,
  linkgroup: grp.linkgroup,
  setname: grp.setname,
  setdesc: grp.setdesc,
  setppgc: grp.setppgc,
  groupstats: grp.groupstats,
  swgc: grp.swgc,

  /* 🛡️ SECURITY */
  antilink: grp.antilink,
  antispam: grp.antispam,
  antiflood: grp.antiflood,
  antibot: grp.antibot,
  autodelete: grp.autodelete,
  blacklist: grp.blacklist,
  whitelist: grp.whitelist,
  securitylog: grp.securitylog,

  /* 👑 OWNER */
  addowner: grp.addowner,
  delowner: grp.delowner,
  listowner: grp.listowner,
  addprem: grp.addprem,
  delprem: grp.delprem,
  listprem: grp.listprem,
  ban: grp.ban,
  unban: grp.unban,
  backup: grp.backup,
  restore: grp.restore,
  clearcache: grp.clearcache,
  plugin: grp.plugin,
  maintenance: grp.maintenanceCmd,
  logs: info.logsCmd,
};

export async function runCommand(ctx: CmdCtx): Promise<CmdResult> {
  const fn = H[ctx.cmd.handler] ?? H[ctx.cmd.name];
  if (fn) return fn(ctx);
  // fallback: custom "text" command from user
  if (ctx.cmd.handler === "text") {
    return { text: String(ctx.cmd.extra?.text ?? "Command ini belum tersedia.") };
  }
  return { text: `❌ Handler "${ctx.cmd.name}" belum tersedia di engine ini.` };
}

export { answerGame } from "./info";
export type { CmdCtx, CmdResult } from "./core";
