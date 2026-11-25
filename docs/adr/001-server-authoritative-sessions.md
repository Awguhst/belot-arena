# ADR 001 · Moving the game authority to a server

**Status** — Local sessions and guest multiplayer are implemented. The original proposal below also describes future competitive services. The [public room implementation](../MULTIPLAYER.md) documents the current protocol, reconnection and deployment.

## Context and decision

The browser MVP needs complete, recoverable play without an account or a backend. Use the pure TypeScript reducer as the sole source of rule decisions. The local adapter holds the private state and publishes projections. A future room service can run the same reducer, own a match per room, and publish each projection over authenticated WebSockets.

Preserve the command, player-view and scoring contracts across the migration. Move the orchestration of bot decisions, automatic phase advances, shuffle, clocks and persistence to the room service. The client store will acquire an asynchronous transport, pending-input handling and reconnect state. The table can continue rendering the same engine views and legal-action descriptors.

## Proposed protocol

1. A guest or authenticated member obtains a short-lived room identity bound to one permitted seat or spectator role.
2. The client submits a match identifier, unique command identifier, expected revision and chosen bid or card. The room service resolves the actor from the connection and validates the command with the engine.
3. A single writer serializes each room. Persist the accepted event and the command identifier atomically. A retry returns the original acknowledgement. A stale revision returns the current permitted projection.
4. Publish the new revision, the recipient's view and its legal choices. Keep the seed, stock, other hands and authoritative log on the server. Bot seats run against the same per-seat projections as humans.
5. On reconnect, authenticate the seat again and send a fresh projection, the acknowledged revision and remaining server clock. An expired clock generates a logged server action under the room's published timeout policy.

Use durable events for replay and recovery, adding snapshots when measured replay latency warrants them. A relational database can hold room results, events and account ownership. Queue coordination or transient presence can use a separate cache when multiple processes require it. Match completion and rating updates need an idempotent result identifier.

## Room modes and integrity

Start with private invitations for one to four human players and bots in empty seats. Next introduce a public casual queue. A ranked queue requires stable reconnect and abandonment policies, reproducible server-side scoring and a tested team rating. Keep assisted guest practice in its own results pool.

The room service enforces seat ownership, legal play and revision order. Delay spectator views, hand reveals and public replay until they cannot inform an ongoing hand. Server-controlled shuffle and clocks remove client discretion over dealing and timeouts. Restrict in-game coaching and undo according to room mode. A server cannot prevent all out-of-band communication or outside assistance. Use reviewed reports, evidence of repeated suspicious partnership patterns and an appeal process. Publish moderation, chat and data-retention rules before adding social features.

## Consequences

The offline game remains useful while transport work proceeds. The authority change requires room lifecycle, identity, connection recovery and delivery ordering work. Keep the per-seat projection tests and deterministic replay corpus as cross-transport acceptance tests. The rated service should import only server-created records when awarding competitive results.
