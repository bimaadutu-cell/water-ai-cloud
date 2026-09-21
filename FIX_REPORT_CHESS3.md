# CHESS3 Upgrade

- Removed the command/engine naming `chess2` -> `chess3` across the TypeScript command path.
- `.chess3` is now the registered FUN command.
- The old Chess2 HTML renderer is no longer the command entry point.
- The supplied CHESS CAP template is copied verbatim as `CHESS3.html` and `public/CHESS3.html`.
- Rich HTML loader now resolves `CHESS3.html` first and keeps the complete HTML document intact for Rich HTML clients.
- Existing fallback paths remain available if a WhatsApp client cannot render Rich HTML.
- Incoming WhatsApp call offers are detected. Native `acceptCall` is attempted only when the active Baileys socket exposes that method; otherwise the call is rejected with an honest status message.
