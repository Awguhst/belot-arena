# Verification report

Verified on 25 November 2026 on Windows, using Node.js 24.14.1, pnpm 11.25.0 and desktop Chromium. The lockfile records the dependency versions.

## Build and automated checks

| Check | Result |
| --- | --- |
| Strict TypeScript and production Vite build | Passed |
| Vitest | 159 passing tests across 14 files |
| Seeded bot simulation | 10,000 scored hands and 118 passed-out auctions |
| Browser workflows | 30 passing Playwright scenarios against the production Docker image, including offline reset, bot pacing, mobile input and four multiplayer scenarios |
| Production container | Built from the lockfile, ran as the unprivileged `node` user, listened on a custom `PORT`, and passed its health check |
| Standalone distribution | Opened an isolated copy of the HTML file in offline Chrome. Verified the three player portraits, all three court ranks, felt, twenty opening deal animations, a sampled advanced-worker decision and restoration after refresh. The browser recorded zero external requests and zero page errors. |

The unit suite covers rules, learning, bot decisions, sessions, statistics, preferences, animation sequencing and score presentation. It includes the six required scoring fixtures, void and climbing obligations, declaration conflicts, Belot timing, hanging points, capot continuation, revision rejection and filtered bot information. Presentation cases check which dealt cards may be revealed, the ordering of trick collection, provisional declarations, accepted bonuses and the distinction between raw points and awarded match points.

## Multiplayer rooms

Independent Chromium sessions hosted and joined **Friendly Belot** with two humans and two bots. An observer who arrived after creation saw changes in occupancy and match status and received no private game messages. Both players switched seats, readied up, played eight tricks, saw identical scores for each team and started a fresh match in the same room. This workflow also passed with a password-protected room and with four independent human players. In the locked room, an incorrect password was rejected and the correct one granted admission.

A separate reconnect scenario recovered directory changes made during disconnection and restored the guest's exact seat and five-card hand. The authority tests cover concurrent joins, room and connection limits, duplicate requests, password throttling, readiness resets, host migration, substitution, fresh deck shuffles on redeals, chat isolation, cleanup and rematches after a completed match. Desktop and phone captures were inspected, including the Bulgarian directory at 320 pixels wide.

Two Chromium guests also used a local TLS reverse proxy in front of the Docker service. The proxy preserved the browser origin and host. Both guests received distinct Secure, HttpOnly, SameSite cookies, upgraded to WSS, discovered the same room and started a match with different private hands. Railway configuration was prepared for one replica. Cloud deployment was outside this local verification.

## Simulated play

The fixture executed **476,394 accepted commands**. It checked the complete 32-card inventory at every transition, bounded the number of transitions, verified eight four-card tricks in every scored hand and reconstructed each final state by replaying its events. Every base raw total matched the active contract.

| Contract | Completed hands |
| --- | ---: |
| Clubs | 485 |
| Diamonds | 734 |
| Hearts | 957 |
| Spades | 1,362 |
| No Trumps | 774 |
| All Trumps | 5,688 |

The run included 363 capots, 129 doubled hands and 123 redoubled hands. Beginner and intermediate policies made 125,385 and 250,792 decisions respectively. Advanced seats made 217 decisions on the opening subset of seeds, including 142 decisions evaluated by Monte Carlo sampling. The fixture uses a small two-world search budget for those decisions.

## Browser scenarios

1. Play a full 51-point match through the controls, advance through hand scoring, open the review and verify local statistics.
2. Refresh during a partial trick. Verify the same cards, score, trick and event count, then undo a human play and the bots’ subsequent moves.
3. Observe a real advanced worker returning a sampled bidding decision.
4. Start a selected contract, request coaching and submit a manual declaration with the first card.
5. Bid and play by touch in a 390-pixel portrait viewport with all eight cards accessible.
6. Complete a lesson, switch between Bulgarian and English during feedback and restore progress after refresh.
7. Retry a tactical puzzle on a 360-pixel screen and verify saved completion and accuracy.
8. Step through a completed hand, compare a legal alternative and inspect all 32 original cards, missed declarations and awarded points.
9. Navigate the replay and score breakdown on a 360-pixel portrait screen.
10. Undo a card while it is in flight and activate reduced motion during the next play.
11. Inspect the twenty opening backs and five private faces. Refresh during the deal and verify the same five saved cards.
12. Follow the four cards to the pile of the engine-designated winner and resize during collection.
13. Switch assistance presets and open the tools while verifying that the table and current deal stay in place.
14. Enable sound with a user gesture, change mixer settings and verify their persistence.
15. Skip the hand tally, inspect its component amounts and reload the scored hand.
16. Enter and exit native browser fullscreen, return to the lounge and resume.
17. Cancel a restart, then start a new practice match and check the old match archive.
18. Switch between two tabs while a trick is being collected. This headless Chromium build keeps both tabs visible, so the test also dispatches a visibility event while the cinematic clock is paused. The saved log contains one play, one collection and the next legal play. The 12-point trick is credited once.
19. Three viewport cases cover 360 × 640, 390 × 844 and 667 × 375. Each checks the bounds of eight rotated cards and the central trick, hit-tests the exposed ranks and suits, and taps a rank to submit its legal play.
20. Click a lifted card and compare the starting position and width of the flying card to its visible face. Check which card backs the animation measures.
21. Check bot timing at Normal and Fast with a virtual clock. A decision can be prepared while the previous card is moving and is committed only when the table unlocks.
22. Reset a scored match, restore it after reload and review its archived hands. Cancel the reset by keyboard on the Bulgarian phone layout and check focus returns to the button.

Screenshots were inspected during bidding, play, trick resolution and hand scoring at desktop, portrait and landscape sizes. Mobile sizes used desktop Chromium emulation. Native iOS Safari and physical phone frame rates remain unverified.

## Interaction timing

The same seeded hand was played twice in each offline build at 1440 × 900 and 390 × 844 in local Chrome. From the human play to the first winner highlight, the previous build took 3.37–3.67 seconds and the updated build took 2.37–2.43 seconds. During deals and plays the 95th-percentile animation-frame interval went from 20.8 ms to 7.1–7.3 ms on this machine. While waiting for a bid, Chrome recorded 424–436 paint events over 1.5 seconds in the previous build and zero in the updated build.

A separate measurement of the same sequence counted 73 card and seat geometry reads across 45 flights, down from 801 reads. With 32 archived matches of 588 commands each, the 95th-percentile time for an active move and save was 0.3 ms. The previous full-history save took 17.1 ms in the same Chrome run.

See the [README](../README.md) for reproducible commands and the [rules profile](RULES.md) for the edge-case interpretations tested.
