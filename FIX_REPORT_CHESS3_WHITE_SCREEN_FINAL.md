# CHESS3 — WHITE SCREEN / RICH HTML FINAL FIX

- Rebuilt `CHESS3.html` from zero using the supplied CHESS CAP white/black digital design.
- Removed the previous CHESS2 page and its `CHESS2` error screen.
- Kept the game self-contained: CSS + JavaScript + chess rules are inside the HTML.
- Fixed the Rich HTML sender so it sends the actual GenAI HTML primitive through `@stazyu/baileys` instead of a generic `{ richResponse: { html } }` object.
- Rich HTML is sent as a renderer-friendly fragment containing `<style>`, body markup and `<script>`, while the source file remains a complete HTML document.
- Added `files.catbox.moe` to trusted sources so the CHESS CAP background music URL can be fetched by the Rich HTML renderer.
- Added the deployed `APP_URL` hostname to trusted sources for online-game API requests.
- The audio element keeps the supplied `https://files.catbox.moe/j8dvrp.mp3` URL, `loop`, `preload`, `playsinline`, and `autoplay`; the page also retries playback after the first user interaction because mobile WebViews may enforce autoplay policy.
- Fixed the online Chess3 adapter to target the new `.square` board elements instead of the old `.cell` elements.
- Kept `.chess3` as the command; `.chess2` is no longer the active Chess command.
- If the connected WhatsApp client itself does not expose/allow the GenAI Rich HTML renderer, no HTML implementation can force that client to render it; the sender now reports the actual transport error instead of silently creating a blank custom payload.

Validation performed locally:
- CHESS3 HTML starts with a complete doctype.
- No `CHESS2` string remains in the new CHESS3 HTML.
- Supplied Catbox audio URL is present.
- Embedded JavaScript passes `node --check`.
