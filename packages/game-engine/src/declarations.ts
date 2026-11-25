import { emptyPoints, sameCard, teamOf } from './cards'
import { RANKS, SUITS } from './types'
import type { Announcement, Card, Contract, Declaration, Rank, TeamPoints } from './types'

const carreRank: Rank[] = ['Q', 'K', '10', 'A', '9', 'J']
function maximalSequences(hand: Card[]): Declaration[] {
  const declarations: Declaration[] = []
  for (const suit of SUITS) {
    let run: Card[] = []
    const finish = () => {
      if (run.length >= 3) {
        const high = run[run.length - 1]!.rank
        declarations.push({
          id: 'seq-' + suit + '-' + run[0]!.rank + '-' + high,
          kind: 'sequence',
          cards: run,
          points: run.length < 4 ? 20 : run.length === 4 ? 50 : 100,
          high,
        })
      }
      run = []
    }
    for (const rank of RANKS) {
      const card = hand.find((c) => c.suit === suit && c.rank === rank)
      if (card) run.push(card)
      else finish()
    }
    finish()
  }
  return declarations
}
export function detectDeclarations(hand: Card[], contract: Contract): Declaration[] {
  if (contract === 'no-trumps') return []
  const declarations = maximalSequences(hand)
  const sequences = [...declarations]
  for (const rank of carreRank) {
    const cards = hand.filter((c) => c.rank === rank)
    if (cards.length !== 4) continue
    const id = 'carre-' + rank
    declarations.push({
      id,
      kind: 'carre',
      cards,
      points: rank === 'J' ? 200 : rank === '9' ? 150 : 100,
      high: rank,
    })
    for (const sequence of sequences) {
      if (!sequence.cards.some((c) => c.rank === rank)) continue
      const remaining = sequence.cards.filter((c) => c.rank !== rank)
      for (const residual of maximalSequences(remaining))
        declarations.push({ ...residual, requiresCarre: id })
    }
  }
  return declarations
}
export function declarationsCompatible(selected: Declaration[]): boolean {
  const used: Card[] = []
  for (const declaration of selected) {
    if (declaration.requiresCarre && !selected.some((d) => d.id === declaration.requiresCarre))
      return false
    if (declaration.cards.some((c) => used.some((previous) => sameCard(c, previous)))) return false
    used.push(...declaration.cards)
  }
  return true
}
/** Pick the highest face-value disjoint subset. All valid subsets remain available for manual selection. */
export function recommendedDeclarations(hand: Card[], contract: Contract): Declaration[] {
  const options = detectDeclarations(hand, contract)
  let best: Declaration[] = []
  let bestPoints = 0
  for (let mask = 1; mask < 2 ** options.length; mask++) {
    const group = options.filter((_, i) => (mask & (1 << i)) !== 0)
    const total = group.reduce((sum, d) => sum + d.points, 0)
    if (total > bestPoints && declarationsCompatible(group)) {
      best = group
      bestPoints = total
    }
  }
  return best
}
export function resolveDeclarations(announcements: Announcement[]): TeamPoints {
  const result = emptyPoints()
  for (const kind of ['sequence', 'carre'] as const) {
    const best = { us: -1, them: -1 }
    const total = emptyPoints()
    for (const { seat, declaration: d } of announcements) {
      if (d.kind !== kind) continue
      const team = teamOf(seat)
      const value =
        kind === 'sequence' ? d.cards.length * 10 + RANKS.indexOf(d.high) : carreRank.indexOf(d.high)
      best[team] = Math.max(best[team], value)
      total[team] += d.points
    }
    if (best.us > best.them) result.us += total.us
    if (best.them > best.us) result.them += total.them
  }
  return result
}
