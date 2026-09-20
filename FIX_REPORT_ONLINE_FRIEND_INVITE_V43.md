# WATER AI CLOUD — Chess2 / TTT Friend Invite + Cross-Phone Real-Time

## Commands
- `.chess2 undang 628xxxxxxxxxx`
- Friend: `.chess2 terima`
- `.ttt undang 628xxxxxxxxxx`
- Friend: `.ttt terima`

## What changed
- Added an in-memory authoritative online room for Chess2 and Tic-Tac-Toe.
- Each room has a private host token and guest token.
- Invitation HTML is a real Rich HTML media card; no PNG is sent when Rich HTML succeeds.
- After acceptance, WATER AI sends a fresh online HTML media card to both phones.
- The HTML card polls `/api/games/:roomId` every 700ms.
- Taps in the HTML submit moves to the server; the server validates turn ownership and legal moves.
- Chess uses the authoritative chess engine (`tryMove`).
- Tic-Tac-Toe uses the authoritative TTT engine (`tryTttMove`).
- Both players see the same state from the same room, so the game is not a local-only JavaScript simulation.
- CORS/no-cache headers are enabled on the game API because Rich HTML can execute in a separate origin/container.

## Important deployment setting
Set `APP_URL` to the public HTTPS URL of the deployed WATER AI CLOUD service, for example:
`APP_URL=https://water-ai-cloud-v2.up.railway.app`

Do not leave `APP_URL=http://localhost:3000` in production or the HTML media will try to poll localhost on the player's phone.

## Note
The online room is currently in server memory. It is designed for two phones connected to the same running WATER AI CLOUD instance. Restarting the service clears active rooms.
