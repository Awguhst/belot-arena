import { cardPoints, emptyPoints, otherTeam, teamOf } from './cards'
import type { Contract, GameState, Multiplier, ScoreBreakdown, Team, TeamPoints } from './types'

const nearest = (points: number): number => Math.floor((points + 5) / 10)
export const BELOT_BONUS = 20
export function roundSplit(raw: TeamPoints, contract: Contract, declaring: Team): TeamPoints {
  if (contract === 'no-trumps') return { us: nearest(raw.us), them: nearest(raw.them) }
  const boundary = contract === 'all-trumps' ? 4 : 6
  const upwardTeam = raw.us === raw.them ? declaring : raw.us < raw.them ? 'us' : 'them'
  const round = (team: Team) => {
    const ending = raw[team] % 10
    const roundUp = ending > boundary || (ending === boundary && team === upwardTeam)
    return Math.floor(raw[team] / 10) + Number(roundUp)
  }
  return { us: round('us'), them: round('them') }
}
type Allocation = Pick<
  ScoreBreakdown,
  'outcome' | 'awarded' | 'hangingBefore' | 'hangingAfter' | 'hangingAwarded'
>
export function allocateScore(
  raw: TeamPoints,
  contract: Contract,
  declaring: Team,
  multiplier: Multiplier,
  hanging = 0,
): Allocation {
  const defenders = otherTeam(declaring)
  const outcome =
    raw[declaring] === raw[defenders] ? 'tied' : raw[declaring] > raw[defenders] ? 'made' : 'failed'
  const split = roundSplit(raw, contract, declaring)
  const entire = nearest((raw.us + raw.them) * multiplier)
  const awarded = emptyPoints()
  const hangingAwarded = emptyPoints()
  let hangingAfter = 0
  if (outcome === 'tied') {
    hangingAfter = hanging + (multiplier > 1 ? entire : split[declaring])
    if (multiplier === 1) awarded[defenders] = split[defenders]
  } else {
    const winner = outcome === 'made' ? declaring : defenders
    if (multiplier > 1 || outcome === 'failed') awarded[winner] = entire
    else Object.assign(awarded, split)
    hangingAwarded[winner] = hanging
    awarded[winner] += hanging
  }
  return { outcome, awarded, hangingBefore: hanging, hangingAfter, hangingAwarded }
}
export function calculateHandScore(
  state: Pick<
    GameState,
    'contract' | 'declaringTeam' | 'multiplier' | 'tricks' | 'declarationPoints' | 'belots' | 'hanging'
  >,
): ScoreBreakdown {
  const { contract, declaringTeam, multiplier, tricks } = state
  if (!contract || !declaringTeam || tricks.length !== 8)
    throw new Error('Scoring requires a completed eight-trick contract')
  const cards = emptyPoints(),
    counts = emptyPoints(),
    lastTrick = emptyPoints()
  const noTrumpBonus = emptyPoints(),
    capotBonus = emptyPoints(),
    belots = emptyPoints()
  for (const { winner, plays } of tricks) {
    const team = teamOf(winner)
    counts[team]++
    for (const { card } of plays) cards[team] += cardPoints(card, contract)
  }
  lastTrick[teamOf(tricks[7]!.winner)] = 10
  const capot: Team | null = counts.us === 8 ? 'us' : counts.them === 8 ? 'them' : null
  if (capot) capotBonus[capot] = 90
  const declarations = contract === 'no-trumps' ? emptyPoints() : { ...state.declarationPoints }
  if (contract !== 'no-trumps')
    for (const bonus of state.belots) belots[teamOf(bonus.seat)] += BELOT_BONUS
  const raw = emptyPoints()
  for (const team of ['us', 'them'] as const) {
    const trickPoints = cards[team] + lastTrick[team]
    if (contract === 'no-trumps') noTrumpBonus[team] = trickPoints
    raw[team] = trickPoints + noTrumpBonus[team] + declarations[team] + belots[team] + capotBonus[team]
  }
  return {
    cardPoints: cards,
    lastTrick,
    declarations,
    belots,
    noTrumpBonus,
    capot,
    capotBonus,
    raw,
    multiplier,
    ...allocateScore(raw, contract, declaringTeam, multiplier, state.hanging),
  }
}
export function calculateMatchResult(
  scores: TeamPoints,
  target: number,
  capot: Team | null,
): Team | null {
  if (capot || scores.us === scores.them || Math.max(scores.us, scores.them) < target) return null
  return scores.us > scores.them ? 'us' : 'them'
}
