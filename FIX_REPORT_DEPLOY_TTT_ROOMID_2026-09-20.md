# Deploy Fix — TTT online roomId

Fixed the TypeScript build error in `src/server/commands/info.ts`:

`Object literal may only specify known properties, and 'roomId' does not exist in type 'TttState'.`

## Root cause
The multiplayer TTT invite/accept flow adds the online room credentials (`roomId`, `hostToken`, `guestToken`) to the command-local `TttState`, but those optional fields were missing from that interface.

## Fix
Added these optional properties to the command-local `TttState` interface:

- `roomId?: string`
- `hostToken?: string`
- `guestToken?: string`

No gameplay behavior was removed.

## Verification
The uploaded project source was inspected directly. A full local TypeScript build could not be completed in this environment because dependency installation timed out, so the original reported TypeScript error was fixed at its exact source location, but a complete clean `next build` is not claimed here.
