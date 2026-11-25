# Belot Club

A Bulgarian Belot club with offline bot play and live, guest-hosted multiplayer rooms. South plays with North against East and West. The interface opens in Bulgarian and also supports English.

## Play

Open **Online rooms** on the website, choose a nickname and join a listed room, or select **Host room**. All four seats are shared between humans and bots. The host can change teams and settings while everyone is waiting. Mark yourself ready, then the host can start. Room passwords are optional. The room remains available for a rematch.

Open **dist/Belot-Club.html** in a current desktop browser for the self-contained edition. It includes the game, bot worker, table artwork and fonts. Select **Играй сега** to start bidding. The **BG** selector changes the language.

The standard match runs to 151. The sliders beside the play button configure difficulty and target. **Тренировка** starts a match with the selected contract already established. The equivalent English control is **Practice**.

## At the table

You sit opposite your partner Elena. Boris is on your left and Martin is on your right. Follow the dealer marker as cards travel around the felt. On your turn, click or tap a bid or a card in your hand. The winning player collects each trick. Open **History** to see who played each card.

The scoreboard shows the match totals and each team's card points for the current hand. Open it for a breakdown. At the end of a hand, the score sheet shows how card points, bonuses and the contract result become match points. Skip the count to see the final figures immediately, review the hand or continue playing.

Select **Reset game** in the table header and confirm to start at 0–0 with a fresh deal, the same match options and bot difficulty. Completed hands from the previous match stay available in Analysis.

Change the assistance preset in **Settings** during play.

| Preset | What you see |
| --- | --- |
| Standard | A clean table with the coach and hints available on demand. This is the default. |
| Learning | Legal-card highlights, play explanations, card values, bidding guidance and automatic declarations. Turn on the automatic coach for extra guidance on your turn. |
| Expert | Manual play with coaching and strength cues disabled. Table animations start on Fast. |

Animation speeds are **Cinematic**, **Normal**, **Fast** and **Instant**. Bot thinking speed has its own setting. Turn motion off for immediate transitions. Sound starts muted. Use the speaker at the top of the table or open **Settings** for master volume, effects level and optional room ambience. The fullscreen button appears in browsers that support it.

## Run from source

Use Node.js 24.14 or newer and pnpm 11.25. Install pnpm with `npm install --global pnpm@11.25.0` if needed. Run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed by Vite, normally [localhost on port 5173](http://127.0.0.1:5173/).

```sh
pnpm build
pnpm start
```

The production server serves the built website, health endpoint and multiplayer WebSocket on one port. It listens on port 3000 by default and respects `PORT`. Offline saves, lessons and the standalone HTML edition remain local. Docker and Railway instructions are in the [multiplayer guide](docs/MULTIPLAYER.md).

## What you can do

- Play all six contracts with Contra, Recontra, declarations, Belot, capot, hanging points and contract-specific rounding.
- Choose one of three bot difficulties. Advanced bidding and card play use bounded Monte Carlo simulations in a Web Worker.
- Ask for a hint, inspect the legal-play obligation, select first-trick declarations manually or undo to a previous human decision. Settings also control speed, motion, rankings, card values and played-card tracking.
- Work through 15 interactive lessons and 25 validated puzzles. The engine grades rules questions and the tactical exercises support authored alternatives.
- Revisit a scored hand action by action, reveal the original hands, compare legal choices and inspect both teams’ point calculations.
- Track local match results, contract performance and learning progress, with separate assisted and unassisted results.

## Save and resume

The local session records accepted commands and replays them on refresh. Leaving the table pauses bot turns. Returning to the table resumes from the saved revision. Starting a different match preserves previously completed hands for analysis.

Browser storage belongs to its origin and user profile. Keep the same browser, address and port for a continuing game. Browsers can give standalone files separate storage or restrict persistence for local files. The hosted or development-server edition provides a stable origin. Saving failures are reported at the table and lobby.

## Verify

```sh
pnpm test
pnpm simulate
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:portable
```

Playwright can also use installed Chrome or Edge on Windows. Set **BELOT_CHROMIUM** to an executable path to select a browser explicitly. **BELOT_TEST_PORT** controls the development-server test port. To run the same browser flows against the production assets without binding a socket, build first and set **BELOT_OFFLINE_TEST=1** in the test environment.

## Project guide

| Area | Implementation |
| --- | --- |
| Web application | React, strict TypeScript, Vite, Zustand, Tailwind utilities, component styles and the Web Animations API |
| Rules authority | **packages/game-engine/**, a deterministic TypeScript library with no runtime dependencies |
| Bots and coaching | **packages/bots/**, seat-specific views, card inference, decision grading and sampled play |
| Learning content | **apps/web/src/learning/**, bilingual lessons, versioned puzzles, grading and progress |
| Browser coverage | **tests/e2e/**, match completion, restore, undo, worker, mobile, study and review |

The [rules profile](docs/RULES.md) records regional choices, declaration visibility and rounding examples. The [architecture guide](docs/ARCHITECTURE.md) describes session ownership and persistence. The [bot guide](docs/BOT_AI.md) explains the search budget, sample generation and heuristic limitations. The [verification report](docs/TEST_RESULTS.md) records the exercised workflows.

Guest multiplayer is available in public rooms. Ranked matchmaking and account services are future work. [Server authority](docs/adr/001-server-authoritative-sessions.md) · [Roadmap](docs/ROADMAP.md) · [Artwork credits](docs/ARTWORK.md)
