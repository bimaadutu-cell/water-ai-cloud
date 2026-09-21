# WATER AI CLOUD — CHESS2 Rich HTML Hardening V56

## CHESS2
- Replaced the Chess2 HTML template with the local `CHESS_CAP.html` template.
- The template is kept as a complete `<!doctype html>` document because Rich HTML implementations differ on whether they require a full HTML envelope or a sanitized fragment.
- `buildChessHtml()` now loads the same template from the deployment root/public directory instead of rebuilding a second divergent Chess renderer in TypeScript.
- `sendRichHtmlToChat()` now tries both complete-document and fragment forms through `sock.sendRichHtml`, then the package helper and payload fallbacks.
- Existing PNG fallback remains active in `.chess2`, so an unsupported Rich HTML client no longer leaves the user with only a black/empty bubble.
- `CHESS_CAP.html` is also copied to `public/CHESS_CAP.html` for deployments where the runtime working directory differs.

## Validation
- Embedded Chess2 JavaScript passes `node --check`.
- The generated template is self-contained and has no external JS/CSS dependency.

## Feature limitations
- `.sendprank` was not added in the requested hidden-human/romantic impersonation form. A transparent AI-character variant can be added instead.
- Real-time answering of a native WhatsApp voice call is not provided by the current Baileys stack. A WebRTC/browser voice room or another telephony/voice provider is required for an actual AI voice conversation.
