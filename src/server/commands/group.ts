/* GROUP + SECURITY + OWNER — real Baileys APIs + DB-backed state. */
import { eq, and, desc, isNull, gte, sql, like } from "drizzle-orm";
import { db } from "@/db";
import {
  groupSettings,
  groupWarnings,
  premiumUsers,
  botOwners,
  banlist,
  commands,
  automations,
  logs,
} from "@/db/schema";
import { CmdCtx, CmdResult, box, truncate, isPremium, progress, MAX_FILE_BYTES, CmdError } from "./core";
import { clearAllGames } from "./state";

/* ------------------------------ group utils ----------------------------- */
async function gs(botId: string, groupId: string): Promise<any> {
  const rows = await db
    .select()
    .from(groupSettings)
    .where(and(eq(groupSettings.botId, botId), eq(groupSettings.groupId, groupId)))
    .limit(1);
  return rows[0] ?? { id: null, settings: {} };
}

export async function saveGs(botId: string, groupId: string, patch: Record<string, unknown>) {
  const cur = await gs(botId, groupId);
  const settings = { ...(cur.settings ?? {}), ...patch };
  if (cur.id) {
    await db.update(groupSettings).set({ settings }).where(eq(groupSettings.id, cur.id));
  } else {
    await db.insert(groupSettings).values({ botId, groupId, settings });
  }
}

async function requireGroup(ctx: CmdCtx): Promise<boolean> {
  if (!ctx.n.isGroup) {
    (ctx as any)._err = "⚠️ Command ini hanya untuk grup.";
    return false;
  }
  return true;
}

/** Publish group text or a replied image/video/audio to the real WhatsApp Status feed. */
export async function swgc(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const statusJid = "status@broadcast";
  const arg = ctx.arg.trim();
  const quoted = await ctx.getRepliedMedia();
  if (!arg && !quoted) {
    return {
      text: box("📢 SWGC — Status Grup", [
        "Reply *foto / video / audio* lalu ketik:",
        `*${ctx.bot.prefix}swgc* [caption opsional]`,
        "",
        "Atau kirim teks saja:",
        `*${ctx.bot.prefix}swgc* <teks status>`,
        "",
        "Bot akan mempublikasikan ke WhatsApp Status (terlihat oleh anggota grup).",
      ]),
    };
  }
  const progressKey = await progress(ctx.sock, ctx.n.remoteJid, null, "⌛ Memasukkan media ke Status Grup...");
  try {
    const meta: any = await ctx.sock.groupMetadata(ctx.n.remoteJid);
    const subject = String(meta.subject || "Grup");
    const participants = (meta.participants ?? [])
      .map((p: any) => p.id || p.jid || p.participant)
      .filter((id: any) => typeof id === "string" && (id.includes("@s.whatsapp.net") || id.includes("@lid")));
    // pastikan bot ikut list
    const botId = ctx.sock.user?.id;
    if (botId && !participants.includes(botId)) participants.push(botId);

    if (quoted) {
      if (quoted.buffer.length > MAX_FILE_BYTES) throw new CmdError("🥀 Media status melebihi batas 50 MB.");
      const caption = arg || `📢 dari *${subject}*`;
      let payload: any;
      if (quoted.mimetype.startsWith("image/")) {
        payload = { image: quoted.buffer, mimetype: quoted.mimetype, caption };
      } else if (quoted.mimetype.startsWith("video/")) {
        payload = { video: quoted.buffer, mimetype: quoted.mimetype || "video/mp4", caption };
      } else if (quoted.mimetype.startsWith("audio/")) {
        payload = { audio: quoted.buffer, mimetype: quoted.mimetype, ptt: true };
      } else {
        payload = { document: quoted.buffer, mimetype: quoted.mimetype, fileName: "status.bin", caption };
      }
      const sent = await ctx.sock.sendMessage(statusJid, payload, {
        statusJidList: participants,
        backgroundColor: "#0b141a",
      } as any);
      if (!sent?.key?.id) {
        // retry tanpa opsi ekstra
        const sent2 = await ctx.sock.sendMessage(statusJid, payload, { statusJidList: participants });
        if (!sent2?.key?.id) throw new CmdError("WhatsApp tidak mengonfirmasi publikasi status.");
      }
    } else {
      const sent = await ctx.sock.sendMessage(
        statusJid,
        { text: `*${subject}*\n\n${arg}` },
        { statusJidList: participants } as any
      );
      if (!sent?.key?.id) throw new CmdError("WhatsApp tidak mengonfirmasi publikasi status.");
    }
    if (progressKey) await progress(ctx.sock, ctx.n.remoteJid, progressKey, "✅ Berhasil masuk ke Status Grup!");
    return { text: box("✅ SWGC BERHASIL", [`Media/teks dari *${subject}* sudah dipublikasikan ke WhatsApp Status.`]) };
  } catch (error: any) {
    if (progressKey) await progress(ctx.sock, ctx.n.remoteJid, progressKey, "🥀 Gagal mempublikasikan status.");
    return {
      text: box("🥀 SWGC GAGAL", [
        String(error?.message || "bot belum punya akses status").slice(0, 220),
        "",
        "Tips: pastikan bot admin grup & akun WA mendukung status.",
      ]),
    };
  }
}

export async function react(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.replyKey) return { text: `⚠️ Reply pesan lalu ketik ${ctx.bot.prefix}react <emoji>` };
  const emoji = Array.from(ctx.arg.trim())[0] || "👍";
  try {
    await ctx.sock.sendMessage(ctx.n.remoteJid, { react: { text: emoji, key: ctx.replyKey } });
    return { text: `✅ Reaksi ${emoji} dikirim.` };
  } catch (error: any) {
    return { text: `🥀 Gagal mengirim reaksi: ${String(error?.message || "error").slice(0, 180)}` };
  }
}

export async function groupinfo(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  try {
    const meta: any = await ctx.sock.groupMetadata(ctx.n.remoteJid);
    return {
      text: box("👥 GROUP INFO", [
        `Subject : ${meta.subject}`,
        `ID      : ${meta.id}`,
        `Anggota : ${meta.participants?.length ?? "?"}`,
        `Admin   : ${meta.participants?.filter((p: any) => p.admin).length ?? "?"}`,
        `Dibuat  : ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString("id-ID") : "-"}`,
        meta.owner ? `Owner   : @${meta.owner.split("@")[0]}` : null,
      ]),
    };
  } catch {
    return { text: "❌ Gagal mengambil info grup." };
  }
}

export async function admin(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  try {
    const meta: any = await ctx.sock.groupMetadata(ctx.n.remoteJid);
    const admins = (meta.participants ?? []).filter((p: any) => p.admin);
    return { text: box("🛡️ ADMIN GRUP", admins.map((p: any) => `@${p.id.split("@")[0]} (${p.admin})`)) };
  } catch {
    return { text: "❌ Gagal memuat admin." };
  }
}

async function mentionAll(ctx: CmdCtx, prefixText: string, withMentions: boolean): Promise<CmdResult> {
  try {
    const meta: any = await ctx.sock.groupMetadata(ctx.n.remoteJid);
    const jids = (meta.participants ?? []).map((p: any) => p.id);
    await ctx.sock.sendMessage(ctx.n.remoteJid, { text: prefixText, mentions: jids });
    return { text: "" };
  } catch {
    return { text: "❌ Gagal mengirim mention." };
  }
}

export async function tagall(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return mentionAll(ctx, `📢 TAG ALL\n${ctx.arg || "Panggilan untuk semua anggota."}\n\n@${(await ctx.sock.groupMetadata(ctx.n.remoteJid)).participants.map((p: any) => p.id.split("@")[0]).join("\n@")}`, false);
}

export async function hidetag(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return mentionAll(ctx, ctx.arg || "📣", true);
}
export const mention = hidetag;

async function resolveTarget(ctx: CmdCtx): Promise<string | null> {
  // @tag from mentions
  const mentioned: string[] = ctx.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  if (mentioned.length) return mentioned[0];
  const num = (ctx.parts[1] ?? "").replace(/[^0-9]/g, "");
  if (num.length >= 8) return `${num}@s.whatsapp.net`;
  return null;
}

export async function addMember(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .add <nomor 62xxx>" };
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.n.remoteJid, [target], "add");
    return { text: `✅ @${target.split("@")[0]} ditambahkan` };
  } catch (e: any) {
    return { text: `❌ Gagal add: ${e?.message ?? "error"}` };
  }
}

export async function kick(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .kick @tag" };
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.n.remoteJid, [target], "remove");
    return { text: `👢 @${target.split("@")[0]} di-kick` };
  } catch (e: any) {
    return { text: `❌ Gagal kick: ${e?.message ?? "error"}` };
  }
}

export async function promote(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .promote @tag" };
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.n.remoteJid, [target], "promote");
    return { text: `⬆️ @${target.split("@")[0]} menjadi admin` };
  } catch (e: any) {
    return { text: `❌ Gagal promote: ${e?.message ?? "error"}` };
  }
}

export async function demote(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .demote @tag" };
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.n.remoteJid, [target], "demote");
    return { text: `⬇️ @${target.split("@")[0]} di-demote` };
  } catch (e: any) {
    return { text: `❌ Gagal demote: ${e?.message ?? "error"}` };
  }
}

export async function warn(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .warn @tag [alasan]" };
  const reason = ctx.arg.replace(target.split("@")[0], "").replace(/^[@\s]+/, "").slice(0, 120) || "Peringatan";
  const existing = await db
    .select()
    .from(groupWarnings)
    .where(and(eq(groupWarnings.botId, ctx.bot.id), eq(groupWarnings.groupId, ctx.n.remoteJid), eq(groupWarnings.jid, target)))
    .limit(1);
  const next = (existing[0]?.count ?? 0) + 1;
  await db
    .insert(groupWarnings)
    .values({ botId: ctx.bot.id, groupId: ctx.n.remoteJid, jid: target, count: next, reason })
    .onConflictDoUpdate({
      target: [groupWarnings.botId, groupWarnings.groupId, groupWarnings.jid],
      set: { count: next, reason, updatedAt: new Date() },
    })
    .catch(() => {});
  db.insert(logs).values({ botId: ctx.bot.id, userId: ctx.bot.userId, level: "warning", event: "security.warn", message: `Warn @${target.split("@")[0]}: ${reason}`, status: "warned", meta: { groupId: ctx.n.remoteJid } }).catch(() => {});
  return { text: `⚠️ @${target.split("@")[0]} di-warn (${next}/5). Alasan: ${reason}` };
}

export async function warnings(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .warnings @tag" };
  const rows = await db
    .select()
    .from(groupWarnings)
    .where(and(eq(groupWarnings.botId, ctx.bot.id), eq(groupWarnings.groupId, ctx.n.remoteJid), eq(groupWarnings.jid, target)))
    .limit(1);
  return { text: rows[0] ? `⚠️ @${target.split("@")[0]}: ${rows[0].count} warn (terakhir: ${rows[0].reason})` : `✅ @${target.split("@")[0]} tidak punya warning.` };
}

export async function mute(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const on = ["on", "1", "yes"].includes(ctx.arg.toLowerCase());
  const off = ["off", "0", "no"].includes(ctx.arg.toLowerCase());
  if (!on && !off) return { text: "Pakai: .mute on | off" };
  try {
    await ctx.sock.groupSettingUpdate(ctx.n.remoteJid, on ? "announcement" : "not_announcement");
    return { text: on ? "🔇 Grup di-mute (hanya admin yang bisa kirim)." : "🔊 Grup di-unmute." };
  } catch (e: any) {
    return { text: `❌ Gagal: ${e?.message ?? "error"}` };
  }
}

export async function linkgroup(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  try {
    const code = await ctx.sock.groupInviteCode(ctx.n.remoteJid);
    return { text: `🔗 Link invite:\nhttps://chat.whatsapp.com/${code}` };
  } catch (e: any) {
    return { text: `❌ Gagal ambil link: ${e?.message ?? "error"}` };
  }
}

export async function setname(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  if (!ctx.arg) return { text: "Pakai: .setname <nama grup>" };
  try {
    await ctx.sock.groupUpdateSubject(ctx.n.remoteJid, ctx.arg.slice(0, 100));
    return { text: `✅ Nama grup diubah ke "${ctx.arg}"` };
  } catch (e: any) {
    return { text: `❌ Gagal: ${e?.message ?? "error"}` };
  }
}

export async function setdesc(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  if (!ctx.arg) return { text: "Pakai: .setdesc <deskripsi>" };
  try {
    await ctx.sock.groupUpdateDescription(ctx.n.remoteJid, ctx.arg.slice(0, 500));
    return { text: "✅ Deskripsi grup diperbarui." };
  } catch (e: any) {
    return { text: `❌ Gagal: ${e?.message ?? "error"}` };
  }
}

export async function setppgc(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const media = await ctx.getRepliedMedia().catch(() => null);
  if (!media || !media.mimetype.startsWith("image/")) return { text: "⚠️ Reply gambar dengan .setppgc" };
  if (typeof ctx.sock.updateProfilePicture !== "function") return { text: "🥀 Baileys pada server tidak menyediakan updateProfilePicture." };
  try {
    await ctx.sock.updateProfilePicture(ctx.n.remoteJid, media.buffer);
    return { text: "✅ Foto profil grup diperbarui." };
  } catch (e: any) {
    return { text: `🥀 Gagal mengubah foto profil grup: ${String(e?.message ?? "error").slice(0, 220)}` };
  }
}

export async function groupstats(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  try {
    const meta: any = await ctx.sock.groupMetadata(ctx.n.remoteJid);
    const ps = meta.participants ?? [];
    return {
      text: box("📈 GROUP STATS", [
        `Total  : ${ps.length} anggota`,
        `Admin  : ${ps.filter((p: any) => p.admin).length}`,
        `Member : ${ps.filter((p: any) => !p.admin).length}`,
      ]),
    };
  } catch {
    return { text: "❌ Gagal memuat statistik." };
  }
}

/* -------------------------------- SECURITY ------------------------------ */
async function setSec(ctx: CmdCtx, key: string, label: string): Promise<CmdResult> {
  const on = ["on", "1", "yes"].includes(ctx.arg.toLowerCase());
  const off = ["off", "0", "no"].includes(ctx.arg.toLowerCase());
  if (!on && !off) return { text: `Pakai: .${ctx.cmd.name} on | off` };
  await saveGs(ctx.bot.id, ctx.n.remoteJid, { [key]: on });
  db.insert(logs).values({ botId: ctx.bot.id, userId: ctx.bot.userId, level: on ? "warning" : "info", event: "security.toggle", message: `${label} ${on ? "AKTIF" : "nonaktif"} di ${ctx.n.remoteJid}`, meta: { groupId: ctx.n.remoteJid } }).catch(() => {});
  return { text: `${on ? "✅" : "⏸️"} ${label} ${on ? "AKTIF" : "NONAKTIF"} di grup ini.` };
}

export async function antilink(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return setSec(ctx, "antilink", "🛡️ Anti Link");
}
export async function antispam(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return setSec(ctx, "antispam", "🛡️ Anti Spam");
}
export async function antiflood(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return setSec(ctx, "antiflood", "🛡️ Anti Flood (8 pesan/12 detik)");
}
export async function antibot(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return setSec(ctx, "antibot", "🛡️ Anti Bot");
}
export async function autodelete(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  return setSec(ctx, "autodelete", "🛡️ Auto Delete (pesan non-admin)");
}

export async function blacklist(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .blacklist @tag" };
  const cur = await gs(ctx.bot.id, ctx.n.remoteJid);
  const list: string[] = Array.isArray(cur.settings?.blacklist) ? cur.settings.blacklist : [];
  if (!list.includes(target)) list.push(target);
  await saveGs(ctx.bot.id, ctx.n.remoteJid, { blacklist: list });
  return { text: `🚫 @${target.split("@")[0]} diblokir di grup ini (${list.length} total).` };
}

export async function whitelist(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const target = await resolveTarget(ctx);
  if (!target) return { text: "Pakai: .whitelist @tag" };
  const cur = await gs(ctx.bot.id, ctx.n.remoteJid);
  const list: string[] = Array.isArray(cur.settings?.blacklist) ? cur.settings.blacklist : [];
  await saveGs(ctx.bot.id, ctx.n.remoteJid, { blacklist: list.filter((j) => j !== target) });
  return { text: `✅ @${target.split("@")[0]} di-unblock.` };
}

export async function securitylog(ctx: CmdCtx): Promise<CmdResult> {
  if (!(await requireGroup(ctx))) return { text: (ctx as any)._err };
  const rows = await db
    .select()
    .from(logs)
    .where(and(eq(logs.botId, ctx.bot.id), like(logs.event, "security.%"), like(sql`coalesce(${logs.meta}::text, '')`, `%${ctx.n.remoteJid}%`)))
    .orderBy(desc(logs.createdAt))
    .limit(8);
  if (!rows.length) return { text: "Log keamanan grup kosong." };
  return { text: box("🛡️ SECURITY LOG", rows.map((l) => `[${new Date(l.createdAt).toLocaleTimeString("id-ID")}] ${truncate(l.message, 60)}`)) };
}

/* --------------------------------- OWNER -------------------------------- */
export async function addowner(ctx: CmdCtx): Promise<CmdResult> {
  const phone = (ctx.parts[1] ?? "").replace(/\D/g, "");
  if (!phone) return { text: "Pakai: .addowner <nomor>" };
  await db.insert(botOwners).values({ botId: ctx.bot.id, phone, addedBy: ctx.n.sender }).catch(() => {});
  return { text: `✅ +${phone} sekarang owner bot ini.` };
}

export async function delowner(ctx: CmdCtx): Promise<CmdResult> {
  const phone = (ctx.parts[1] ?? "").replace(/\D/g, "");
  if (!phone) return { text: "Pakai: .delowner <nomor>" };
  const rows = await db.delete(botOwners).where(and(eq(botOwners.botId, ctx.bot.id), eq(botOwners.phone, phone))).returning();
  return { text: rows.length ? `✅ +${phone} dihapus dari owner.` : "❌ Nomor bukan owner." };
}

export async function listowner(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db.select().from(botOwners).where(eq(botOwners.botId, ctx.bot.id));
  const all = [ctx.bot.ownerNumber ?? "", ...rows.map((r) => r.phone)].filter(Boolean);
  return { text: box("👑 OWNER LIST", all.map((p) => `+${p}`)) };
}

export async function addprem(ctx: CmdCtx): Promise<CmdResult> {
  const mentioned: string[] = ctx.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const jid = mentioned[0] ?? null;
  if (!jid) return { text: "Pakai: .addprem @tag [1jam|2hari|forever] — default 1 jam" };
  const dur = (ctx.parts[1] ?? "").toLowerCase();
  let expiresAt: Date | null = null;
  let durLabel = "1 jam (default)";
  if (dur === "forever" || dur === "selamanya") {
    expiresAt = null;
    durLabel = "forever";
  } else if (dur) {
    const m = /^(\d+)\s*(jam|j|hari|d|day|days)$/i.exec(dur);
    if (m) {
      const n = parseInt(m[1], 10);
      const isHours = m[2].toLowerCase().startsWith("j");
      const hours = isHours ? n : n * 24;
      expiresAt = new Date(Date.now() + hours * 3600e3);
      durLabel = `${n} ${isHours ? "jam" : "hari"}`;
    } else {
      const days = parseInt(dur, 10);
      if (days > 0) {
        expiresAt = new Date(Date.now() + days * 86400e3);
        durLabel = `${days} hari`;
      }
    }
  } else {
    // default masa aktif: 1 jam
    expiresAt = new Date(Date.now() + 3600e3);
  }
  await db
    .insert(premiumUsers)
    .values({ botId: ctx.bot.id, jid, phone: jid.split("@")[0], expiresAt, addedBy: ctx.n.sender })
    .onConflictDoUpdate({
      target: [premiumUsers.botId, premiumUsers.jid],
      set: { expiresAt, addedBy: ctx.n.sender },
    })
    .catch(() => {});
  return {
    text: `💎 @${jid.split("@")[0]} jadi PREMIUM (${durLabel})${
      expiresAt ? `\n⏳ Aktif sampai: ${expiresAt.toLocaleString("id-ID")}` : ""
    }`,
  };
}

export async function delprem(ctx: CmdCtx): Promise<CmdResult> {
  const mentioned: string[] = ctx.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const jid = mentioned[0] ?? null;
  if (!jid) return { text: "Pakai: .delprem @tag" };
  const rows = await db.delete(premiumUsers).where(and(eq(premiumUsers.botId, ctx.bot.id), eq(premiumUsers.jid, jid))).returning();
  return { text: rows.length ? `✅ Premium @${jid.split("@")[0]} dihapus.` : "❌ User bukan premium." };
}

export async function listprem(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db.select().from(premiumUsers).where(eq(premiumUsers.botId, ctx.bot.id)).limit(20);
  if (!rows.length) return { text: "Belum ada user premium." };
  return {
    text: box("💎 PREMIUM LIST", rows.map((r) => `@${r.jid.split("@")[0]} — ${r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("id-ID") : "forever"}`)),
  };
}

export async function ban(ctx: CmdCtx): Promise<CmdResult> {
  const mentioned: string[] = ctx.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const jid = mentioned[0] ?? null;
  if (!jid) return { text: "Pakai: .ban @tag" };
  const reason = ctx.arg.replace(jid.split("@")[0], "").trim().slice(0, 120) || "Diban owner";
  await db.insert(banlist).values({ botId: ctx.bot.id, jid, reason }).catch(() => {});
  db.insert(logs).values({ botId: ctx.bot.id, userId: ctx.bot.userId, level: "warning", event: "security.ban", message: `@${jid.split("@")[0]} di-ban: ${reason}`, meta: { jid } }).catch(() => {});
  return { text: `🔨 @${jid.split("@")[0]} di-BAN dari bot ini.` };
}

export async function unban(ctx: CmdCtx): Promise<CmdResult> {
  const mentioned: string[] = ctx.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const jid = mentioned[0] ?? null;
  if (!jid) return { text: "Pakai: .unban @tag" };
  const rows = await db.delete(banlist).where(and(eq(banlist.botId, ctx.bot.id), eq(banlist.jid, jid))).returning();
  return { text: rows.length ? `✅ @${jid.split("@")[0]} di-unban.` : "❌ User tidak di-ban." };
}

export async function backup(ctx: CmdCtx): Promise<CmdResult> {
  const [cmds, autos] = await Promise.all([
    db.select().from(commands).where(eq(commands.botId, ctx.bot.id)),
    db.select().from(automations).where(eq(automations.botId, ctx.bot.id)),
  ]);
  const payload = {
    app: "WATER AI CLOUD",
    version: 3,
    exportedAt: new Date().toISOString(),
    bot: {
      name: ctx.bot.name,
      prefix: ctx.bot.prefix,
      ownerNumber: ctx.bot.ownerNumber,
      description: ctx.bot.description,
      settings: ctx.bot.settings,
    },
    commands: cmds.map((c) => ({
      name: c.name,
      description: c.description,
      category: c.category,
      enabled: c.enabled,
      handler: c.handler,
      permissions: c.permissions,
      premium: c.premium,
      extra: c.extra,
    })),
    automations: autos.map((a) => ({ type: a.type, name: a.name, trigger: a.trigger, action: a.action, enabled: a.enabled })),
  };
  const buf = Buffer.from(JSON.stringify(payload, null, 2));
  return {
    media: { kind: "document", buffer: buf, mimetype: "application/json", filename: `backup-${ctx.bot.name}.json`, caption: "📦 Backup konfigurasi bot. Kirim ulang dengan .restore untuk import." },
  };
}

export async function restore(ctx: CmdCtx): Promise<CmdResult> {
  const media = await ctx.getRepliedMedia().catch(() => null);
  if (!media) return { text: "Reply file backup JSON dengan .restore" };
  let data: any;
  try {
    data = JSON.parse(media.buffer.toString("utf8"));
  } catch {
    return { text: "❌ File bukan JSON valid." };
  }
  if (data?.app !== "WATER AI CLOUD" || !data?.bot) return { text: "❌ File bukan backup WATER AI CLOUD yang valid." };
  // replace bot's commands & automations with the backup content
  const { commands: cmdsTable, automations: autosTable } = await import("@/db/schema");
  await db.delete(cmdsTable).where(eq(cmdsTable.botId, ctx.bot.id));
  await db.delete(autosTable).where(eq(autosTable.botId, ctx.bot.id));
  for (const c of data.commands ?? []) {
    await db.insert(cmdsTable).values({
      botId: ctx.bot.id,
      userId: ctx.bot.userId,
      name: String(c.name ?? "").slice(0, 40),
      description: String(c.description ?? "").slice(0, 200),
      category: String(c.category ?? "general").slice(0, 32),
      enabled: !!c.enabled,
      handler: String(c.handler ?? c.name ?? "").slice(0, 32),
      permissions: ["all", "admin", "owner"].includes(c.permissions) ? c.permissions : "all",
      premium: !!c.premium,
      extra: c.extra ?? {},
    });
  }
  for (const a of data.automations ?? []) {
    await db.insert(autosTable).values({
      botId: ctx.bot.id,
      userId: ctx.bot.userId,
      type: String(a.type ?? "keyword").slice(0, 32),
      name: String(a.name ?? a.type).slice(0, 64),
      trigger: a.trigger ?? {},
      action: a.action ?? {},
      enabled: a.enabled !== false,
    });
  }
  return { text: `✅ Restore selesai: ${(data.commands ?? []).length} command + ${(data.automations ?? []).length} automation di-import.` };
}

export async function clearcache(ctx: CmdCtx): Promise<CmdResult> {
  clearAllGames();
  return { text: "🧹 Cache & state game dibersihkan." };
}

export async function plugin(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db
    .select()
    .from(commands)
    .where(and(eq(commands.botId, ctx.bot.id), eq(commands.enabled, true)));
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  return {
    text: box("🧩 MODULES LOADED", [
      `Total command aktif: ${rows.length}`,
      ...[...byCat.entries()].map(([cat, n]) => `${cat}: ${n} command`),
    ]),
  };
}

export async function maintenanceCmd(ctx: CmdCtx): Promise<CmdResult> {
  const on = ["on"].includes(ctx.arg.toLowerCase());
  const off = ["off"].includes(ctx.arg.toLowerCase());
  if (!on && !off) return { text: "Pakai: .maintenance on | off" };
  const settings = { ...(ctx.bot.settings ?? {}), maintenance: on };
  const { bots } = await import("@/db/schema");
  await db.update(bots).set({ settings }).where(eq(bots.id, ctx.bot.id));
  return { text: on ? "🛠️ Mode maintenance AKTIF — bot hanya merespons owner." : "✅ Mode maintenance dimatikan." };
}

export { isNull, gte };
