import { SEATS, createDeck, legalCardsFor, sameCard } from '../../game-engine/src'
import type { Card, GameState, PlayerView, Seat } from '../../game-engine/src'
import { cardKey, visiblePlays } from './heuristic'
import { shuffled } from './random'

type Destination = Seat | 'stock'

/**
 * Reconstruct only hypothetical deals. Past plays rule out a hypothetical remaining
 * card whenever holding it would have made the observed play illegal.
 */
export function prepareSampler(view: PlayerView) {
  const played = visiblePlays(view)
  const visible = new Set([...view.hand, ...played.map((p) => p.card)].map(cardKey))
  const unknown = createDeck().filter((card) => !visible.has(cardKey(card)))
  const slots: Destination[] = []
  for (const seat of SEATS) {
    if (seat !== view.seat) {
      for (let i = 0; i < view.counts[seat]; i++) slots.push(seat)
    }
  }
  while (slots.length < unknown.length) slots.push('stock')
  if (slots.length !== unknown.length) throw new Error('Inconsistent public card counts')

  const owner = new Map<string, Seat>()
  for (const { seat, declaration } of view.declarations) {
    for (const card of declaration.cards) owner.set(cardKey(card), seat)
  }
  for (const { seat, suit } of view.belots) {
    for (const rank of ['Q', 'K'] as const) owner.set(cardKey({ rank, suit }), seat)
  }
  const allowed = unknown.map((card) => {
    const declaredOwner = owner.get(cardKey(card))
    return new Set<Destination>(declaredOwner ? [declaredOwner] : slots)
  })
  if (view.contract) {
    for (const trick of [...view.tricks.map((t) => t.plays), view.trick]) {
      for (let i = 1; i < trick.length; i++) {
        const { seat, card } = trick[i]
        const earlier = trick.slice(0, i)
        unknown.forEach((possible, index) => {
          if (!allowed[index].has(seat)) return
          const legal = legalCardsFor([card, possible], earlier, view.contract!, seat)
          if (!legal.some((option) => sameCard(option, card))) allowed[index].delete(seat)
        })
      }
    }
  }

  const permittedSlots = allowed.map((destinations) =>
    slots.flatMap((seat, slot) => (destinations.has(seat) ? [slot] : [])),
  )
  const unrestricted = permittedSlots.every((list) => list.length === slots.length)
  const cardIndexes = unknown.map((_, index) => index)

  function assignment(random: () => number): number[] | null {
    if (unrestricted) return shuffled(cardIndexes, random)
    // An augmenting path can move an earlier placement when a later card has fewer options.
    const choices = permittedSlots.map((options) => shuffled(options, random))
    const slotCards = slots.map(() => -1)
    function place(card: number, tried: Set<number>): boolean {
      for (const slot of choices[card]) {
        if (tried.has(slot)) continue
        tried.add(slot)
        if (slotCards[slot] === -1 || place(slotCards[slot], tried)) {
          slotCards[slot] = card
          return true
        }
      }
      return false
    }
    const order = shuffled(cardIndexes, random).sort((a, b) => choices[a].length - choices[b].length)
    for (const index of order) if (!place(index, new Set())) return null
    return slotCards
  }

  return (random: () => number): GameState | null => {
    const slotCards = assignment(random)
    if (!slotCards) return null
    const hands: Record<Seat, Card[]> = { south: [], east: [], north: [], west: [] }
    hands[view.seat] = [...view.hand]
    const stock: Card[] = []
    slots.forEach((seat, index) =>
      (seat === 'stock' ? stock : hands[seat]).push(unknown[slotCards[index]]),
    )
    const originalHands: Record<Seat, Card[]> = { south: [], east: [], north: [], west: [] }
    for (const seat of SEATS) {
      originalHands[seat] = [...hands[seat], ...played.filter((p) => p.seat === seat).map((p) => p.card)]
    }
    const { seat: _perspective, hand: _hand, counts: _counts, ...publicState } = view
    return {
      ...publicState,
      config: { target: view.target },
      version: 1,
      seed: 0,
      stock,
      hands,
      originalHands,
    }
  }
}
