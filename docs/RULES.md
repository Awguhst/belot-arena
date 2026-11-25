# Bulgarian Classic v1

Saved matches, replay envelopes and study puzzles identify this profile as `bulgarian-classic-v1`. The supplied specification determines the implementation. The descriptions published by [Belot.BG](https://belot.bg/belot/rules/) and [Belot Arena](https://belotarena.com/belot-rules) provide the Bulgarian table conventions.

## Deal and auction

South and North play against East and West. The turn order is South → East → North → West. The seat immediately to the dealer's right receives the first packet, opens the auction and leads the first trick. Deal three cards to every player, then two to every player. After bidding, deal the last three to each player. West deals the first hand by default, so the guest opens the auction. Each subsequent deal moves the dealer one seat to the right.

Four passes before any bid close the hand without scoring. The next dealer shuffles a fresh 32-card deck. A pass leaves a player eligible to bid on a later turn. Contracts ascend from clubs to diamonds, hearts, spades, No Trumps and All Trumps. Any player can raise. A defender can double an undoubled contract. A declarer or their partner can redouble a doubled contract. A higher contract cancels either multiplier. Every bid, double or redouble restarts the count of passes. Three passes end an established auction.

## Tricks

The deck contains 7, 8, 9, 10, J, Q, K and A in all four suits. The trick winner leads next.

| Ranking, strongest first | Points in that order |
| --- | --- |
| Trump J, 9, A, 10, K, Q, 8, 7 | 20, 14, 11, 10, 4, 3, 0, 0 |
| Plain A, 10, K, Q, J, 9, 8, 7 | 11, 10, 4, 3, 2, 0, 0, 0 |

Follow suit whenever possible. In a suit contract, a player following a trump lead must beat the current trump if able, even when their partner is winning. When void in the led suit, a player may discard if their partner is winning. Otherwise they must trump, or overtrump an opponent's trump when possible. If they cannot overtrump, any card is legal.

In No Trumps, every suit uses plain ranking. Following suit is the only obligation. In All Trumps, every suit uses trump ranking and a player must climb in the led suit when possible. In both contracts, only the led suit can win.

## Announcements

A player chooses combinations while playing their first card. The sequence order runs from 7 through A as listed above. A maximal sequence of three pays 20, four pays 50, and five or more pays 100. Its full length counts in the comparison. Four queens, kings, tens or aces pay 100, four nines pay 150 and four jacks pay 200. Sevens and eights have no carré value.

Each card can be used once across selected combinations. Manual selection may omit any eligible announcement. Automatic assistance chooses a disjoint set with the largest face value. After trick one, the highest sequence wins its team all its announced sequence points. Compare length first and then top rank. An exact opposing tie cancels every sequence. Decide the carré contest separately using J, 9, A, 10, K, Q in descending order. No Trumps suppresses both contests and Belot.

Belot pays 20 for a qualifying K–Q pair. A suit contract permits the trump pair. All Trumps permits a pair in each suit. The engine announces it when the first member leads, follows suit, or is played as the suit contract's trump. An off-suit All Trumps discard using the first member loses that pair's bonus.

## Scoring and carry

Sum the captured cards for each partnership and add 10 for the final trick. The base totals are 162 in a suit contract, 258 in All Trumps and 260 in No Trumps after doubling. Add accepted declarations and Belots. In No Trumps, double the captured card total and final trick. Add 90 for winning all eight tricks after that doubling.

Compare unrounded totals. A successful regular contract pays both teams their respective points. Failed contracts pay the defenders the whole hand. On a regular tie the defenders receive their rounded share and the declarers' rounded share hangs. A decisive double or redouble pays all multiplied raw points to the winner. On a doubled tie, the whole multiplied result hangs. Prior hanging points are stored as scoreboard points. The next decisive winner collects them exactly once.

For a split in a suit contract the rounding boundary is 6. Endings below it round down and endings above it round up. For All Trumps the boundary is 4. Where both teams end at the boundary, round the smaller share up. When tied, the hanging share rounds up. No Trumps uses nearest-integer rounding after doubling. A single combined award uses half-up rounding after multiplication.

| Case | Scoreboard result |
| --- | --- |
| Suit, successful 96 to 66 | 9 to 7 |
| All Trumps, successful 134 to 124 | 13 to 13 |
| Suit, tied 106 each | 10 defenders, 11 hanging |
| All Trumps, tied 154 each | 15 defenders, 16 hanging |
| No Trumps, capot | 35 |
| No Trumps, doubled capot | 70 |

A standard match ends at 151 on a completed non-capot hand with a single leader. If the total scores are tied, play continues. A capot and a passed-out deal both postpone the finish. Practice can use a shorter target or begin each hand with a specified contract assigned to South.

## Profile decisions and household variations

- The default uses seeded Fisher–Yates shuffling and omits the physical cut. A different seed is generated for each live match.
- Once a combination is declared, its constituent cards are public in this digital profile. The two contests settle after the fourth card of trick one. Undeclared combinations and undealt cards stay private. Some tables announce only the type until comparison. [Belot Arena](https://belotarena.com/belot-rules)
- A chosen carré uses all four cards of its rank. The profile permits any remaining maximal sequence of at least three cards. For example, four jacks plus 7–8–9–10 of hearts can earn the carré and a heart quarte. Without the carré, the heart sequence runs through J and counts once. Manual mode shows the shorter alternative when its carré is selected. The reference specifies that a shared card can belong to only one announced combination and leaves residual runs implicit. [Belot.BG](https://belot.bg/belot/rules/)
- Capot adds 90 to the team that took every trick. Eligible declarations and Belot still contribute to the raw comparison. The supplied profile specifies those awards independently.
- Belot is announced automatically on the first eligible play of the pair. Warnings and manual selection apply to sequences and carrés.
- The profile fixes the round-before-carry and multiplier order. Tables that multiply already rounded points can produce a different outcome. The fixtures above are normative here.
