# V34 — Fix Railway Turbopack wrtc + pairing WATERAIC

## Root cause deploy fail
`@stazyu/baileys` → VoIP → `@roamhq/wrtc` native binary.
Turbopack tried to put native asset into ESM chunks → build failed.

## Fix
1. `serverExternalPackages` includes `@stazyu/baileys`, `@roamhq/wrtc*`
2. `engine.ts` loads Baileys via `createRequire` (runtime Node, not bundled)
3. Pairing code custom **WATERAIC** via `requestPairingCode(phone, "WATERAIC")`
4. Browser identity tetap: **Ubuntu / Chrome / 22.04**

## Deploy
```
npm install
npm run build
npm start
```
Atau push ke Railway (Dockerfile).
