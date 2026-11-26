# Public multiplayer rooms

Open **Online rooms** from the club or visit `/#online`. Enter a nickname, then select **Join** beside a room or **Host room** to open your own. A lock beside the title means the host requires a password. Nicknames can coincide. An HTTP-only session cookie identifies the guest, and the browser remembers the nickname.

## Playing together

The club sidebar stays available in the room browser and waiting area. On a phone, open it with the menu button at the top of the screen. You can visit lessons or settings while seated, then select **Return to room**. **Leave room** releases your seat. A match uses the full screen for the table.

The host reserves one to four human places and the remaining places are bots. Manual seat swaps support human partners or opponents. The host can change a password, move players, convert empty seats, or switch rules options before play. Changes to seats or game settings clear human readiness. Starting the next game always requires an explicit host action.

Each player sees their own hand at the bottom. The score sheet identifies both partnerships by team number so players can compare the same totals from different seats. Scores and legal actions come from the server. A guest who reconnects within the grace period recovers their seat and current view. The host can choose automatic bot substitution. With substitution disabled and an unlimited turn timer, a missing player can hold up play until they return. Ownership transfers to a connected human if the host leaves.

At the score sheet the group can continue the match. The host can also end it between hands and return the group to the waiting area. After the match, the same group can reconfigure seats and ready up for a rematch. Waiting-room chat is temporary and can be muted per guest. Spectating and private messaging are unavailable.

## Serving the club

`pnpm dev` runs the directory, game service and frontend on the same local Vite server. For production, run `pnpm build` followed by `pnpm start`. The browser uses the origin that served the page for both its session and its WebSocket. To allow other devices on your network to join, use the production server's address on that network. In public deployments use HTTPS.

```sh
docker build -t belot-club .
docker run --rm -p 127.0.0.1:8080:3000 belot-club
```

The Docker container runs as the `node` user. Visit [the container’s room browser](http://127.0.0.1:8080/#online) or check [its health endpoint](http://127.0.0.1:8080/health).

Railway uses the root Dockerfile and `railway.json`. Create a single service, assign a public domain, and keep **one replica**. Railway supplies the port and checks `/health`. Rooms, online matches, messages and server session signing material live in memory and are discarded on restart or deployment. Offline saved games are independent. [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles) · [Railway health checks](https://docs.railway.com/deployments/healthchecks)

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | 3000 / 0.0.0.0 | Production listening address |
| `PUBLIC_ORIGIN` | Same host | Optional exact allowed browser origin, including scheme and port |
| `MAX_CONNECTIONS` / `MAX_ROOMS` | 512 / 100 | Service-wide limits |
| `ROOM_GRACE_MS` | 60000 | Reserve a disconnected seat before applying the room policy |
| `ROOM_IDLE_MS` | 3600000 | Expire inactive rooms |
| `BOT_DELAY_MS` | 650 | Delay for a bot turn |
| `GAME_TRANSITION_MS` | Per-phase pacing | Optional fixed system transition delay, useful in integration tests |
| `TRUST_PROXY` | Off | Set to `1` only behind a trusted reverse proxy that supplies the nearest forwarded client address |

## Protocol and privacy

The same-origin bootstrap at `POST /api/multiplayer/session` issues a signed, HTTP-only, SameSite cookie. The WebSocket at `/multiplayer/socket` validates both origin and cookie before admission. The public guest ID is distinct from the session credential. Multiple tabs sharing the same guest count once for presence.

Subscribers receive a directory snapshot, then individual room changes and aggregate presence updates. Only members receive the roster and chat. The server uses a fresh cryptographic shuffle for every online hand, including redeals after a passed-out auction. Each human receives their own engine projection and legal actions. Room configuration commands use room revisions. Plays use match IDs and engine revisions. Requests carry unique IDs, and reconnecting clients receive authoritative snapshots.

Passwords are salted and hashed with scrypt. The directory receives only a lock flag. The server limits password attempts, joins, room creation, chat, payload sizes, queued work and retained messages. Room permissions and legal play are checked again on the server.
