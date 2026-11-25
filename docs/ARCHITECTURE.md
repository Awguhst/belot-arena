# Architecture

Belot Club supports offline play in a static browser edition and online play through a single Node service. React renders the directory, waiting rooms, table, lessons, puzzles, guest statistics and review. The local session and multiplayer authority use the same deterministic rules package. Online clients receive a projection for their own seat. [Multiplayer architecture and deployment](MULTIPLAYER.md)

## Code ownership

| Location                                                                             | Responsibility                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `packages/game-engine/src/types.ts`                                                  | Versioned contracts for commands, public views, authoritative state, scoring and replay          |
| `cards.ts`, `tricks.ts`, `declarations.ts`, `scoring.ts`, `match.ts` in that package | Seeded shuffling, card obligations, announcements, allocation and turn transitions               |
| `packages/bots/src`                                                                  | Decision heuristics, hidden-card inference, simulation and localized tactical explanations       |
| `apps/web/src/session.ts`                                                            | Local match authority, projections, command submission, history reconstruction and practice undo |
| `apps/web/src/store.ts`                                                              | Zustand session and preferences, local storage and migration                                     |
| `apps/web/src/ConnectedTable.tsx` and `botWorker.ts`                                 | Local turn scheduling, guarded input submission, projected hints, undo and worker dispatch       |
| `apps/web/src/Table.tsx`                                                             | Renders South’s view and legal actions, preferences, animations and table controls               |
| `apps/server/src` | Guest sessions, public presence and rooms, authoritative multiplayer matches, clocks and bot workers |
| `packages/multiplayer/src/protocol.ts` | Public listings, member snapshots, private seat projections and command types |
| `apps/web/src/online` | Room browser, waiting area, reconnecting WebSocket client and rotating the table for each seat |
| `apps/web/src/learning`                                                              | Typed study positions, bilingual lesson content, engine-backed grading and local progress        |
| `apps/web/src/Review.tsx` and `Statistics.tsx`                                       | Completed-hand analysis and guest performance summaries                                          |

## One turn

1. The session asks the engine for a fresh player-specific view and legal actions.
2. A human chooses a control or a bot evaluates its permitted view. Both return the same revision-stamped command type.
3. The authority checks the actor, revision, phase, bid or card, and any manual announcements. A successful command produces a new state and one versioned event.
4. The store records the new session before the next screen update. The table animates the resulting state. System commands collect tricks, score completed hands and deal the next hand.

The pure engine runs in the browser, workers and the Node room server. Offline play uses a seed from browser cryptographic randomness. The same seed and commands reproduce the match, including the recorded bot moves. For online play, the room server shuffles a fresh 32-card deck using Node's cryptographic random generator before each hand. The engine deals from that supplied deck, and only the server holds the complete deal.

### Core entry points

```ts
import {
  applyCommand,
  createMatch,
  getLegalActions,
  getPlayerView,
  replayGame,
} from '@belot/game-engine'

const initial = createMatch({ dealer: 'west', target: 151 }, 42)
const south = getPlayerView(initial, 'south')
const bid = getLegalActions(south, 'south').find((a) => a.type === 'bid' && a.bid === 'hearts')!
const accepted = applyCommand(initial, bid)
const reproduced = replayGame(initial, [accepted.event])
// reproduced and accepted.state have equal contents.
```

Additional exports cover tricks, card obligations, scoring and declaration resolution. The [rules profile](RULES.md) defines important edge cases and the reference fixtures.

## Table presentation

The connected table saves the positions of visible cards, card backs and player stations immediately before submitting a command. After acceptance, `apps/web/src/table/animationPlan.ts` compares consecutive South-facing projections. It emits the packet deal, contract confirmation, card play or pile clearing appropriate to that transition. Opponent deal packets carry a seat and slot. Only South’s packets carry a card face. Opening a newly created match plays its opening deal once. Restoring a saved match, including a save at revision zero, displays the current position immediately.

A completed trick uses the winner supplied by the engine in the resolution turn. The presentation queues the fourth card’s landing, winner highlight, stack gathering, collection and raw-point transfer. The chip sums the four captured cards using the active contract’s engine values. The scoreboard and end-of-hand ledger consume the engine’s subsequent results.

`animationGeometry.ts` reads the actual table anchors. `animationFlights.ts` converts the measured geometry into transform, flip and opacity keyframes for the Web Animations API. Physical movement, including rearranging South’s hand, adapts to the current viewport. The timeline paces local input and bot dispatch with a bounded deadline. It never submits game commands. On resize, a hidden tab, a rewind, skipping, a speed change or unmount, the controller cancels the affected effects and releases the temporary card masks. Instant mode and system reduced motion use the same rule transitions.

## Information boundaries

Private state contains all hands, stock, original hands and seed. `getPlayerView` constructs an explicit list of public fields and copies only the viewer's hand. Public information includes announcements, current and completed tricks, auction, visible card counts and scores. The connected table supplies the presentation component with South’s projection and corresponding legal actions. A worker receives only its acting seat’s view, legal choices and a decision budget. Live hints use South’s view. Leaving the table cancels scheduled turn callbacks. A stale worker response cannot advance the session after navigation or undo.

Completed-hand review obtains original hands through the replay adapter once the scoring transition has occurred. Decision grading reconstructs the view from immediately before the move. Original hands and missed combinations are available in the separately labelled hindsight section. Puzzle positions use explicit study data.

The device owner controls local browser storage. Local snapshots serve personal practice and recovery. Competitive results require an independent authority on the server. See [ADR 001](adr/001-server-authoritative-sessions.md).

## Replay, persistence and recovery

A match record contains a schema version, ruleset, seed, configuration and an ordered event list. Each event contains the accepted command, resulting revision and resulting phase. The adapter replays validated commands to recover private state. It checks revision and phase continuity, so a repeated scoring event or stale move cannot be applied twice. A bot completion must still correspond to the active session object before dispatch.

The version 4 session envelope holds the live replay, preferences and references to immutable archived matches. The store writes new archives before publishing the envelope. A card play or settings change normally writes only that envelope. Versions 1–3 load with their replay events and preferences intact. Under a tight storage quota, archived records can remain inline. Match history entries are validated independently, and a corrupt active record leaves recovered preferences and valid history available. Learning progress has its own versioned storage. A write failure surfaces a warning while keeping the in-memory session usable.

### Coaching and sound at the table

Standard mode keeps coaching closed and offers help on demand. Learning mode enables card values, legal-play guidance and bidding advice. Automatic coaching is a separate switch. Expert mode suppresses strategic hints and strength indicators, including the guarded session hint request. The live settings drawer applies preferences to the current table. Bot deliberation runs during the preceding card movement. The table submits the resulting action when both the thinking interval and the movement finish. Leaving or rewinding the position cancels its pending worker.

The Web Audio mixer synthesizes card sounds from filtered noise and scoring cues from short sine envelopes. The optional ambience is a filtered noise loop routed through the master gain separately from effects. Sound starts muted. A user gesture unlocks the audio context. Public view transitions supply cues on the same timing scale as the card animations. Restored views, repeated revisions and undo jumps produce no event sounds. Leaving the table releases audio resources.

Undo truncates the event stream at the last South bid or play, then rebuilds the earlier decision. That removes subsequent bot decisions, trick outcomes and score changes together. The adapter continues tracking learning assistance separately from game rules.

## Implementation limits

Review reconstructs frames on demand. Large personal archives will eventually benefit from indexed storage and checkpointed loads. Bot heuristics and finite sampled continuations give estimates about hidden information. The offline edition stores one active match per device. The online service supports simultaneous rooms on one server replica and keeps guest matches in memory. [Bot difficulty](BOT_AI.md) · [Multiplayer deployment](MULTIPLAYER.md)
