# Roadmap

## Strengthen local practice

- Expand native-speaker review of Bulgarian lesson wording and investigate household variants with documented examples. New rule semantics get new profile identifiers so historical replays retain their meaning.
- Evaluate bot strength using paired matches with reversed seats and common deals. Report intervals alongside win rates. Tune bidding, opponent modelling and search budgets using held-out deals and timing profiles from phones.
- Extend hand review with multi-trick counterfactual rollouts and uncertainty estimates. Keep immediate decision information separate from post-hand reveals.
- Add puzzle difficulty calibration using opt-in aggregate attempts. Daily puzzle selection can use the existing stable ID, ruleset and perspective. Generated puzzles should pass engine validation and editorial review before publication.
- Move large archives to IndexedDB, retain migration fixtures and allow explicit export/import of local history.

## Private and casual tables

The public room directory supports guests, password protection, mixed human and bot tables, seat assignment and reconnects. Future online work includes durable room recovery, an optional spectator projection and casual matchmaking. See the [multiplayer guide](MULTIPLAYER.md).

## Competitive play and ratings

A match gives one shared outcome for each partnership. Random deals, repeat partnerships, side selection, substitutions and player uncertainty affect how much the outcome tells us about individual skill. Start with server-verified standard matches. Compare the following models in shadow evaluation before exposing standings.

| Candidate | Fit and experiment |
| --- | --- |
| Team-performance model based on TrueSkill | Infer distributions for four individual skills from the ordering of two team performances. Start with additive team performance and measure whether persistent partnerships need an additional effect. [Herbrich, Minka and Graepel](https://proceedings.neurips.cc/paper/2006/file/f44ee263952e65b3610b8ba51229d1f9-Paper.pdf) |
| Team-aware Glicko-2 baseline | Standard Glicko-2 updates a competitor against its opponent and tracks rating deviation and volatility. Rating a recurring fixed partnership as a single competitor is a useful baseline. Individual ratings with changing partners require a specified team performance model and per-member evidence allocation. [Glickman's specification](https://www.glicko.net/glicko/glicko2.pdf) |

Evaluate next-match predictive log loss, reliability by predicted win probability, cold-start behaviour and uncertainty under frequent partner changes. Split evaluation chronologically and compare matched versus fixed partnerships. Start from wins and losses across complete matches. Use margin of victory only if it improves held-out predictions without rewarding score manipulation. Fixed partnerships alone may leave each partner's contribution poorly identified.

Introduce ranked matchmaking with a widening uncertainty-aware search, disconnect handling and bot/guest eligibility rules. After verifying rating calibration and integrity handling, add seasons and leaderboards. Clubs, leagues, tournament brackets and moderated chat can reuse stable account identities, verified match results and the room system.
