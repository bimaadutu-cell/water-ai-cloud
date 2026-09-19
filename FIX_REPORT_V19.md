# V19 — Fix deploy TypeScript error

## Error
```
src/server/commands/info.ts:1476
Type error: types "chess2" | "quiz" | ... and "tictactoe" have no overlap
```

## Fix
- Added `"tictactoe"` to `Game.kind` union in `src/server/commands/state.ts`
