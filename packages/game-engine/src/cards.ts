import { RANKS, SEATS, SUITS } from './types'
import type { Card, Contract, Rank, Seat, Team, TeamPoints } from './types'

export const nextSeat = (seat: Seat): Seat => SEATS[(SEATS.indexOf(seat) + 1) % 4]!
export const teamOf = (seat: Seat): Team => (seat === 'south' || seat === 'north' ? 'us' : 'them')
export const otherTeam = (team: Team): Team => (team === 'us' ? 'them' : 'us')
export const emptyPoints = (): TeamPoints => ({ us: 0, them: 0 })
export const sameCard = (a: Card, b: Card): boolean => a.rank === b.rank && a.suit === b.suit
export const createDeck = (): Card[] => SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
const plain: Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A']
const trumps: Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J']
const values: Record<Rank, number> = { '7': 0, '8': 0, '9': 0, J: 2, Q: 3, K: 4, '10': 10, A: 11 }
export const isTrumpRanked = (card: Card, contract: Contract) =>
  contract === 'all-trumps' || card.suit === contract
export const cardStrength = (card: Card, contract: Contract) =>
  (isTrumpRanked(card, contract) ? trumps : plain).indexOf(card.rank)
export function cardPoints(card: Card, contract: Contract): number {
  if (isTrumpRanked(card, contract)) {
    if (card.rank === 'J') return 20
    if (card.rank === '9') return 14
  }
  return values[card.rank]
}

/** Mulberry32 followed by rejection sampling for uniform Fisher–Yates indices. */
export function shuffledDeck(seed: number, handNumber = 1): Card[] {
  let state = (seed ^ Math.imul(handNumber, 0x9e3779b9)) >>> 0
  const draw = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return (x ^ (x >>> 14)) >>> 0
  }
  const deck = createDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const bound = i + 1
    const limit = 0x100000000 - (0x100000000 % bound)
    let n = draw()
    while (n >= limit) n = draw()
    const j = n % bound
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}
