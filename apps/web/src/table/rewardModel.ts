import {
  cardPoints,
  emptyPoints,
  teamOf,
  type PublicState,
  type TeamPoints,
  type ScoreBreakdown,
  type Declaration,
  type Seat,
  type Suit,
  type Contract,
} from '@belot/game-engine'

export interface MatchSummary {
  hands: number
  won: number
  tricks: number
}

export function summarizeMatch(hands: readonly PublicState[]): MatchSummary {
  const summary = { hands: 0, won: 0, tricks: 0 }
  for (const hand of hands) {
    if (!hand.result) continue
    summary.hands++
    if (hand.result.raw.us > hand.result.raw.them) summary.won++
    summary.tricks += hand.tricks.filter((trick) => teamOf(trick.winner) === 'us').length
  }
  return summary
}

/** These are values of captured cards; last trick and contract adjustments appear in the ledger. */
export function capturedPoints(view: Pick<PublicState, 'tricks' | 'contract'>): TeamPoints {
  const points = emptyPoints()
  if (view.contract) {
    for (const trick of view.tricks) {
      for (const { card } of trick.plays) points[teamOf(trick.winner)] += cardPoints(card, view.contract)
    }
  }
  return points
}

export type LedgerKey =
  | 'cardPoints'
  | 'declarations'
  | 'belots'
  | 'lastTrick'
  | 'capotBonus'
  | 'noTrumpBonus'
  | 'raw'
  | 'multiplier'
  | 'hangingBefore'
  | 'hangingAwarded'
  | 'hangingAfter'
  | 'awarded'
export type LedgerRow = { key: LedgerKey; points: TeamPoints } | { key: LedgerKey; value: number }
export function scoreRows(result: ScoreBreakdown, declarationsAnnounced = false): LedgerRow[] {
  const rows: LedgerRow[] = [{ key: 'cardPoints', points: result.cardPoints }]
  for (const key of ['declarations', 'belots', 'lastTrick', 'capotBonus', 'noTrumpBonus'] as const) {
    if (result[key].us || result[key].them || (key === 'declarations' && declarationsAnnounced))
      rows.push({ key, points: result[key] })
  }
  rows.push({ key: 'raw', points: result.raw })
  if (result.multiplier !== 1) rows.push({ key: 'multiplier', value: result.multiplier })
  if (result.hangingBefore) rows.push({ key: 'hangingBefore', value: result.hangingBefore })
  if (result.hangingAwarded.us || result.hangingAwarded.them)
    rows.push({ key: 'hangingAwarded', points: result.hangingAwarded })
  if (result.hangingAfter) rows.push({ key: 'hangingAfter', value: result.hangingAfter })
  rows.push({ key: 'awarded', points: result.awarded })
  return rows
}

export type PublicNotice =
  | { kind: 'declaration'; seat: Seat; declaration: Declaration }
  | { kind: 'belot'; seat: Seat; suit: Suit }
  | { kind: 'resolved'; points: TeamPoints }
  | { kind: 'contract'; contract: Contract; multiplier: number }
  | { kind: 'contra' | 'recontra'; seat: Seat }

/** Seek, restore and undo cut the presentation stream; historical announcements stay in the log. */
export function newPublicNotices(before: PublicState | null, after: PublicState): PublicNotice[] {
  if (!before || before.handNumber !== after.handNumber || before.revision + 1 !== after.revision)
    return []
  const notices: PublicNotice[] = []
  const lastBid = after.bids.at(-1)
  if (
    after.bids.length > before.bids.length &&
    (lastBid?.bid === 'contra' || lastBid?.bid === 'recontra')
  )
    notices.push({ kind: lastBid.bid, seat: lastBid.seat })
  if (before.phase === 'BIDDING' && after.phase === 'FINAL_DEAL' && after.contract)
    notices.push({ kind: 'contract', contract: after.contract, multiplier: after.multiplier })
  for (const announcement of after.declarations.slice(before.declarations.length))
    notices.push({ kind: 'declaration', ...announcement })
  for (const belot of after.belots.slice(before.belots.length)) notices.push({ kind: 'belot', ...belot })
  if (!before.tricks.length && after.tricks.length === 1 && after.declarations.length)
    notices.push({ kind: 'resolved', points: after.declarationPoints })
  return notices
}
