import { cardStrength, teamOf } from './cards'
import type { Card, Contract, Play, Seat } from './types'

function winningPlay(trick: Play[], contract: Contract): Play {
  if (!trick.length) throw new Error('An empty trick has no winner')
  let best = trick[0]!
  for (const play of trick.slice(1)) {
    if (
      play.card.suit === best.card.suit
        ? cardStrength(play.card, contract) > cardStrength(best.card, contract)
        : play.card.suit === contract
    )
      best = play
  }
  return best
}
export const determineTrickWinner = (trick: Play[], contract: Contract) =>
  winningPlay(trick, contract).seat
export type Obligation = 'lead' | 'follow' | 'climb' | 'partner' | 'trump' | 'overtrump' | 'discard'
export function cardObligation(
  hand: Card[],
  trick: Play[],
  contract: Contract,
  seat: Seat,
): { cards: Card[]; reason: Obligation } {
  if (!trick.length) return { cards: [...hand], reason: 'lead' }
  const led = trick[0]!.card.suit
  const winning = winningPlay(trick, contract)
  const following = hand.filter((c) => c.suit === led)
  const beating = (cards: Card[]) =>
    cards.filter((c) => cardStrength(c, contract) > cardStrength(winning.card, contract))
  if (following.length) {
    if (contract === led || contract === 'all-trumps') {
      const higher = beating(following)
      if (higher.length) return { cards: higher, reason: 'climb' }
    }
    return { cards: following, reason: 'follow' }
  }
  if (teamOf(winning.seat) === teamOf(seat)) return { cards: [...hand], reason: 'partner' }
  const trumps = hand.filter((c) => c.suit === contract)
  if (trumps.length && winning.card.suit !== contract) return { cards: trumps, reason: 'trump' }
  if (trumps.length) {
    const higher = beating(trumps)
    if (higher.length) return { cards: higher, reason: 'overtrump' }
  }
  return { cards: [...hand], reason: 'discard' }
}
export const legalCardsFor = (hand: Card[], trick: Play[], contract: Contract, seat: Seat) =>
  cardObligation(hand, trick, contract, seat).cards
