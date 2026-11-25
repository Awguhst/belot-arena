# Belot bot decisions

Each decision starts with a seat-specific `PlayerView` and the engine’s legal actions. The view contains the seat’s hand, public card counts, contract, bids, declarations, Belot announcements, tricks and scores. The shuffle seed and undealt stock stay in the authoritative session. Partners use the same interface as opponents. Hints and review grades also use this projection.

## Beginner and intermediate

The intermediate policy scores all legal bids using suit length, trump honors, aces, protected tens and Belot pairs. It adjusts for the current bidder, partner’s auction and the risk of raising or doubling. Its card policy tracks outstanding higher cards and public suit voids. It values points already on the table, the opponents still to act, contributing to a winning partner, preservation of winners, prospective Belots and the cost of using trump.

The beginner uses the same basic hand and partner evaluation. On one quarter of decisions with alternatives, it draws from a bounded group of reasonably close actions. Its choices are reproducible from public information. The actual proportion of suboptimal choices is lower because the draw can return the highest-ranked action.

## Advanced

1. Start from the known hand and subtract all played cards from the deck. Unplayed cards explicitly shown by public announcements have fixed owners.
2. For each observed play and hypothetical remaining card, ask the engine whether that play would have been legal if the player also held that card. This excludes impossible holdings from failure to follow, trump or climb while preserving partner-winning exceptions.
3. Draw a possible unseen deal consistent with the public hand sizes. During bidding, reserve twelve unseen stock cards. For constrained positions, randomized bipartite matching assigns every unknown card to a permitted slot.
4. Evaluate every legal candidate on the same sampled worlds. Each continuation runs through the engine’s auction, declarations, tricks and final scoring. Subsequent players choose actions from their own hypothetical projections. A passed-out auction returns zero.
5. Select the highest mean difference between the teams’ awarded scoreboard points. Ties favor the intermediate recommendation. The default budget is eight deals per candidate, configurable up to 64. Forced moves bypass sampling.

The browser runs advanced decisions in a dedicated module worker. A six-and-a-half-second timeout, unsupported workers, message failure or a failed worker launch returns a legal heuristic decision. The turn revision in the command allows a session to discard stale results after undo, reset or navigation.

The search uses a simple rollout policy and approximates the distribution of feasible deals. Randomized matching produces feasible samples with unequal probabilities. Bids affect the continuation policy but do not yield a calibrated probability distribution over opponents’ holdings. The objective covers the current hand. Hanging points still outstanding at the end of the sampled hand receive no projected future value. This is flat Monte Carlo search over possible deals. Playing strength has not been calibrated against expert humans.

## Coaching and review

`chooseHeuristic` returns a translation key, a mandatory-action flag and a nearby alternative when available. `evaluateDecision` compares the chosen action with the strongest heuristic score using the information available at that turn. Its labels range from recommended to potential mistake. They measure the policy’s preference. Human review is particularly valuable for close calls, partnership conventions and long-term match tactics.

## Reproduce the checks

Run `pnpm exec vitest run packages/bots/tests/bots.test.ts` for the public-projection, reproducibility, forced-choice, partnership and inference tests. Run `pnpm simulate` for 10,000 completed seeded hands and every intervening passed-out auction. A smaller run is available with `pnpm exec tsx packages/bots/tests/simulate.ts 100`.

The simulation checks card conservation at every state, legal actions, progress bounds, eight complete tricks per scored hand, base point totals for all contracts and exact equality of the replayed final state. Beginner and intermediate policies play throughout. Advanced seats run two-world simulations on the first 24 seeded deals so the regression also exercises the search path.

The verified 10,000-hand run covered 476,394 commands, 118 additional passed-out auctions and 142 decisions with completed Monte Carlo sampling. It included 485 clubs, 734 diamonds, 957 hearts, 1,362 spades, 774 no-trumps and 5,688 all-trumps hands. There were 363 capots, 129 doubled hands and 123 redoubled hands. Every invariant and replay check passed.
