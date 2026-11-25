import { describe, expect, it } from 'vitest'
import {
  CONTRACTS,
  SEATS,
  applyAction,
  createMatch,
  getLegalActions,
  getPlayerView,
  legalCardsFor,
  nextSeat,
  sameCard,
  validateAction,
} from '../../game-engine/src'
import type { Card, GameState, PlayerView } from '../../game-engine/src'
import { chooseDecision, chooseHeuristic, evaluateDecision, explainDecision } from '../src'
import { prepareSampler } from '../src/inference'
import { randomStream } from '../src/random'
import { cardKey } from '../src/heuristic'

describe('public-information decision making', () => {
  it('makes identical decisions when the private deck and other hands are changed behind an identical view', () => {
    const first = createMatch({}, 197)
    const second: GameState = {
      ...first,
      seed: -123,
      stock: [...first.stock].reverse(),
      hands: { ...first.hands, east: first.hands.west, west: first.hands.east },
    }
    const a = getPlayerView(first, 'south'),
      b = getPlayerView(second, 'south')
    expect(a).toEqual(b)
    for (const key of ['seed', 'hands', 'stock', 'originalHands', 'config'])
      expect(a).not.toHaveProperty(key)
    for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
      const context = { difficulty, simulations: 3 }
      const choice = chooseDecision(a, getLegalActions(a, 'south'), context)
      expect(choice).toEqual(chooseDecision(b, getLegalActions(b, 'south'), context))
      expect(validateAction(first, choice.action)).toBe(true)
      if (difficulty === 'advanced') expect(choice.samples).toBe(3)
    }
  })

  it('contributes a ten to a partner’s winning last-seat trick', () => {
    const state = createMatch({ practiceContract: 'no-trumps' }, 1)
    const c = (rank: Card['rank']): Card => ({ suit: 'hearts', rank })
    const view: PlayerView = {
      ...getPlayerView(state, 'south'),
      turn: 'south',
      hand: [c('7'), c('10')],
      trick: [
        { seat: 'east', card: c('8') },
        { seat: 'north', card: c('A') },
        { seat: 'west', card: c('9') },
      ],
    }
    const options = getLegalActions(view, 'south')
    const choice = chooseHeuristic(view, options)
    expect(choice.action).toMatchObject({ card: c('10') })
    expect(choice.mandatory).toBe(false)
    expect(choice.reason).toBe('support')
    expect(explainDecision(choice.reason, 'bg')).toContain('Партньорът')
    expect(evaluateDecision(view, options, choice.action).grade).toBe('recommended')
  })

  it('labels forced plays and zero-budget fallbacks', () => {
    const state = createMatch({}, 18)
    const view = getPlayerView(state, state.turn)
    const options = getLegalActions(view, view.seat)
    expect(chooseDecision(view, options, { difficulty: 'advanced', simulations: 0 })).toEqual(
      chooseHeuristic(view, options),
    )
    const only = chooseDecision(view, options.slice(0, 1), { difficulty: 'advanced' })
    expect(only).toMatchObject({ mandatory: true, reason: 'forced' })
  })

  it('samples varied hidden deals with the original public sizes during bidding', () => {
    const state = createMatch({}, 810)
    const view = getPlayerView(state, state.turn)
    const sample = prepareSampler(view)
    const random = randomStream(7)
    const alternatives = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const deal = sample(random)!
      expect(deal.hands[view.seat]).toEqual(view.hand)
      expect(deal.stock).toHaveLength(12)
      for (const hand of Object.values(deal.hands)) expect(hand).toHaveLength(5)
      expect(new Set([...deal.stock, ...Object.values(deal.hands).flat()].map(cardKey)).size).toBe(32)
      alternatives.add(deal.hands[nextSeat(view.seat)].map(cardKey).sort().join(','))
    }
    expect(alternatives.size).toBeGreaterThan(1)
  })

  it.each(CONTRACTS)(
    'respects observed legal plays and declarations in every sampled %s position',
    (contract) => {
      let state = createMatch({ practiceContract: contract }, 481)
      const random = randomStream(144)
      while (state.phase !== 'HAND_SCORING') {
        if (state.phase !== 'PLAYING_TRICK') {
          state = applyAction(state, { type: 'advance', revision: state.revision })
          continue
        }
        const view = getPlayerView(state, state.turn)
        const sampler = prepareSampler(view)
        for (let attempt = 0; attempt < 3; attempt++) {
          const sample = sampler(random)!
          expect(sample).toBeTruthy()
          const hands = Object.fromEntries(
            SEATS.map((seat) => [seat, [...sample.originalHands[seat]]]),
          ) as typeof sample.hands
          for (const entry of view.declarations) {
            for (const card of entry.declaration.cards)
              expect(hands[entry.seat].some((c) => sameCard(c, card))).toBe(true)
          }
          for (const entry of view.belots) {
            expect(
              hands[entry.seat].filter(
                (c) => c.suit === entry.suit && (c.rank === 'Q' || c.rank === 'K'),
              ),
            ).toHaveLength(2)
          }
          for (const trick of [...view.tricks.map((t) => t.plays), view.trick]) {
            trick.forEach((p, i) => {
              const legal = legalCardsFor(hands[p.seat], trick.slice(0, i), contract, p.seat)
              expect(legal.some((c) => sameCard(c, p.card))).toBe(true)
              hands[p.seat] = hands[p.seat].filter((c) => !sameCard(c, p.card))
            })
          }
        }
        const options = getLegalActions(view, view.seat)
        const choice = chooseHeuristic(view, options)
        state = applyAction(state, choice.action)
      }
    },
  )
})
