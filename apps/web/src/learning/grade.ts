import {
  CONTRACTS,
  SEATS,
  SUITS,
  allocateScore,
  applyAction,
  cardPoints,
  cardStrength,
  createDeck,
  createMatch,
  detectDeclarations,
  determineTrickWinner,
  getLegalActions,
  legalCardsFor,
  nextSeat,
  teamOf,
} from '@belot/game-engine'
import type { Bid, Card } from '@belot/game-engine'
import { cardKey } from './model'
import type { Puzzle } from './model'

function highestValues(cards: Card[], value: (card: Card) => number): Card[] {
  const best = Math.max(...cards.map(value))
  return cards.filter((card) => value(card) === best)
}

/** Derive the available answers again from the learner's public study position. */
export function solvePuzzle(puzzle: Puzzle): string[] {
  const state = puzzle.initialState
  const seat = puzzle.perspective
  switch (state.kind) {
    case 'deck':
      return [String(createDeck().length)]
    case 'partner':
      return SEATS.filter((other) => other !== seat && teamOf(other) === teamOf(seat))
    case 'count': {
      const known = new Set([...state.seen, ...state.hand].map(cardKey))
      const unseen = createDeck().filter((card) => card.suit === state.suit && !known.has(cardKey(card)))
      return [String(unseen.length)]
    }
    case 'trick': {
      const winner = determineTrickWinner(state.trick, state.contract)
      return [cardKey(state.trick.find((play) => play.seat === winner)!.card)]
    }
    case 'play': {
      let legal = legalCardsFor(state.hand, state.trick, state.contract, seat)
      if (state.askAboutSet)
        return [legal.length === state.hand.length ? 'any' : legal.map(cardKey).sort().join('+')]
      if (state.tactic === 'donate') {
        const partnerWins = legal.filter((card) => {
          const winner = determineTrickWinner([...state.trick, { seat, card }], state.contract)
          return winner !== seat && teamOf(winner) === teamOf(seat)
        })
        legal = highestValues(partnerWins, (card) => cardPoints(card, state.contract))
      }
      if (state.tactic === 'cheapest-winner') {
        const winners = legal.filter(
          (card) => determineTrickWinner([...state.trick, { seat, card }], state.contract) === seat,
        )
        legal = highestValues(winners, (card) => -cardStrength(card, state.contract))
      }
      return legal.map(cardKey)
    }
    case 'auction': {
      let auction = createMatch({ dealer: state.dealer }, 1)
      for (const bid of state.bids) {
        auction = applyAction(auction, {
          type: 'bid',
          bid,
          seat: auction.turn,
          revision: auction.revision,
        })
      }
      const legal: Bid[] = getLegalActions(auction, seat).flatMap((action) =>
        action.type === 'bid' ? [action.bid] : [],
      )
      if (state.goal === 'lowest-higher')
        return CONTRACTS.filter((bid) => legal.includes(bid)).slice(0, 1)
      if (state.goal === 'double' || state.goal === 'redouble') {
        return legal.filter((bid) => bid === (state.goal === 'double' ? 'contra' : 'recontra'))
      }
      // This tactic compares suit bids only, using the five visible cards.
      const strengths = SUITS.filter((suit) => legal.includes(suit)).map((suit) => ({
        suit,
        strength: state.hand
          .filter((card) => card.suit === suit)
          .reduce((sum, card) => sum + 1 + cardPoints(card, suit), 0),
      }))
      const best = Math.max(...strengths.map((suit) => suit.strength))
      return strengths.filter((suit) => suit.strength === best).map((suit) => suit.suit)
    }
    case 'declarations': {
      const available = detectDeclarations(state.hand, state.contract)
      return [String(Math.max(0, ...available.map((declaration) => declaration.points)))]
    }
    case 'score': {
      const { awarded } = allocateScore(
        state.raw,
        state.contract,
        state.bidder,
        state.multiplier,
        state.hanging,
      )
      return [awarded.us + ' : ' + awarded.them]
    }
  }
}

export function validatePuzzle(puzzle: Puzzle): string[] {
  const issues: string[] = []
  const expected = [...puzzle.expectedActions, ...(puzzle.alternativeSolutions ?? [])].sort()
  const derived = solvePuzzle(puzzle).sort()
  if (!derived.length || derived.join('|') !== expected.join('|'))
    issues.push('Engine and published answers disagree')
  const choices = puzzle.choices.map((answer) => answer.id)
  if (new Set(choices).size !== choices.length || derived.some((id) => !choices.includes(id)))
    issues.push('Invalid answer choices')
  const state = puzzle.initialState
  const visible = [
    ...('hand' in state ? state.hand : []),
    ...('trick' in state ? state.trick.map((play) => play.card) : []),
    ...(state.kind === 'count' ? state.seen : []),
  ].map(cardKey)
  if (visible.length !== new Set(visible).size) issues.push('Duplicate visible cards')
  if ('trick' in state) {
    state.trick.slice(1).forEach((play, index) => {
      if (nextSeat(state.trick[index]!.seat) !== play.seat) issues.push('Trick order is invalid')
    })
    if (
      state.kind === 'play' &&
      state.trick.length &&
      nextSeat(state.trick.at(-1)!.seat) !== puzzle.perspective
    ) {
      issues.push('The learner is out of turn')
    }
  }
  return issues
}
