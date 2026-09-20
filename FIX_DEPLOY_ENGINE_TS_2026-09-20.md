# Deploy fix — engine.ts

## Error
`src/server/engine.ts:582:13 — Cannot find name 'bot'. Did you mean 'bots'?`

## Cause
The `message.received` logging block was accidentally inserted inside `recordOut()`. That function only has `rb`, `to`, `type`, and `text`; it does not define `bot` or `n`.

## Fix
- Removed the misplaced inbound-message log block from `recordOut()`.
- Added the same `message.received` log inside `handleIncoming(rb, bot, m)`, where `bot` and normalized message `n` are actually in scope.
- Outgoing message logging remains handled by `recordOut()`.
- Incoming message database/SSE/webhook behavior remains intact.

This fixes the TypeScript scope error without removing the requested bot message logs.
