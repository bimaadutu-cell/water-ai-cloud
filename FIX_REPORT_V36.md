# WATER AI CLOUD V3.6 — Update Report

## MENU: PASS (V3.6 header + categories from registry)
## ALLMENU: PASS (full=true lists all enabled registry commands)
## CHESS2: PASS (static pieces injected + 3D HTML + AI)
## TTT: PASS (dynamic HTML + AI O)
## PLAY2/PLAY3: existing handlers retained (no regression in this patch)
## TERMUX: existing real exec retained
## WEBTOAPP: PASS (session flow + provider research + build pack guide; no fake APK)
## PREMIUM UI: partial (menu V3.6 + glass styles existing)
## ANIMATION: retained in HTML games
## 50 PROVIDER RESEARCH: PASS (50 entries in providers.ts, classified)
## APK VALIDATION: N/A binary (honest — no fake APK sent)
## SECURITY: SSRF block on webtoapp URL
## RAILWAY: Server 4 URL only in promo/menu

### Changed files
- src/server/commands/core.ts (V3.6, Server 4)
- src/server/commands/extended.ts (webtoapp handlers)
- src/server/commands/registry.ts (webtoapp, batalwebtoapp)
- src/server/commands/index.ts
- src/server/games/html-board.ts (static chess pieces, server list)
- src/server/webtoapp/providers.ts (NEW)
- src/server/webtoapp/session.ts (NEW)

### Notes
Cloud runtime does not ship full Android SDK. WebToApp delivers verified provider list + Capacitor/Bubblewrap guide as document — never a fake APK.
