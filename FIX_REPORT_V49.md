# V49 — Boards visible + audio HTML + AI memory + Termux

## Fixes
1. **Chess/TTT HTML**: board cells pre-rendered in HTML (visible even if JS blocked by WA)
2. **Chess/TTT image**: still primary path (PNG via sharp) from V48
3. **play2/play3**: base64 audio embed limit raised to ~4.5MB so longer tracks fit in HTML player
4. **AI memory**: conversation history up to 24 turns / 6 hours for `.ai` and AUTO AI mode
5. **`.ai clear`**: hapus memori chat
6. **NEW `.termux`**: Termux-style HTML + sandboxed shell session (help, date, curl, calc, echo, ls, …)

## Termux usage
```
.termux
help
date
curl https://httpbin.org/get
calc 2+2*3
exit
```

## Security
Termux is **allowlist-only** (no arbitrary shell, no file write, curl GET max 64KB / 12s).

## Deploy
Deploy full zip. No extra env required for Termux.
AI memory is in-process (resets on restart).
