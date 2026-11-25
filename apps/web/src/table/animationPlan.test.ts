import { describe, expect, it } from 'vitest'
import {
  applyAction,
  cardPoints,
  createMatch,
  getLegalActions,
  getPlayerView,
  nextSeat,
  teamOf,
  type GameState,
} from '@belot/game-engine'
import { cardId, durationOf, effectiveSpeed, tableEvent, timingFor } from './animationPlan'

const view = (state: GameState) => getPlayerView(state, 'south')
const advance = (state: GameState) => applyAction(state, { type: 'advance', revision: state.revision })
describe('public table choreography', () => {
  it('deals three and two in whole packets from the dealer’s right and includes only South faces', () => {
    const state = createMatch({ dealer: 'east' }, 777)
    const opening = tableEvent(null, view(state), true)
    expect(opening?.kind).toBe('deal')
    if (opening?.kind !== 'deal') throw Error('Opening deal missing')
    const seats = opening.moves.map((move) => move.seat)
    expect(seats).toEqual([
      'north',
      'north',
      'north',
      'west',
      'west',
      'west',
      'south',
      'south',
      'south',
      'east',
      'east',
      'east',
      'north',
      'north',
      'west',
      'west',
      'south',
      'south',
      'east',
      'east',
    ])
    expect(opening.moves.filter((move) => move.seat === 'south').map((move) => move.card)).toEqual(
      state.hands.south,
    )
    expect(opening.moves.filter((move) => move.seat !== 'south').every((m) => !('card' in m))).toBe(true)
    expect(durationOf(opening, timingFor('instant'))).toBe(0)
  })
  it('uses 3+2+3 for preselected contracts and skips a restored opening state', () => {
    const v = view(createMatch({ practiceContract: 'hearts' }, 919))
    const e = tableEvent(null, v, true)
    expect(e?.kind === 'deal' && e.moves.length).toBe(32)
    expect(tableEvent(null, v)).toBeNull()
  })
  it('animates only newly dealt South cards after the auction', () => {
    let state = createMatch({}, 309)
    for (const bid of ['clubs', 'pass', 'pass', 'pass'] as const) {
      state = applyAction(state, { type: 'bid', bid, seat: state.turn, revision: state.revision })
    }
    const before = view(state),
      after = view(advance(state))
    const e = tableEvent(before, after)
    if (e?.kind !== 'deal') throw Error('Final deal missing')
    expect(e.moves.length).toBe(12)
    expect(e.moves[0].seat).toBe(nextSeat(state.dealer))
    expect(e.existing).toEqual(before.hand)
    expect(e.moves.flatMap((m) => (m.card ? [cardId(m.card)] : []))).toEqual(
      after.hand.slice(5).map(cardId),
    )
    expect(e.moves.every((m) => m.slot >= 5 && m.slot <= 7)).toBe(true)
  })
  it('stacks exactly the public four cards for the winner supplied in the resolution turn', () => {
    let s = createMatch({ practiceContract: 'no-trumps' }, 508)
    for (let i = 0; i < 3; i++) s = applyAction(s, getLegalActions(s, s.turn)[0])
    const resolved = applyAction(s, getLegalActions(s, s.turn)[0])
    const e = tableEvent(view(s), view(resolved))
    if (e?.kind !== 'play' || !e.collect) throw Error('Collection missing')
    expect(e.collect.plays).toEqual(resolved.trick)
    expect(e.collect.winner).toBe(resolved.turn)
    expect(e.collect.team).toBe(teamOf(resolved.turn))
    expect(e.collect.points).toBe(
      resolved.trick.reduce((sum, p) => sum + cardPoints(p.card, 'no-trumps'), 0),
    )
    expect(tableEvent(view(resolved), view(advance(resolved)))).toBeNull()
  })
  it('cancels discontinuous and rewound positions without generating effects', () => {
    const s = createMatch({ practiceContract: 'spades' }, 91)
    const once = applyAction(s, getLegalActions(s, s.turn)[0])
    const twice = applyAction(once, getLegalActions(once, once.turn)[0])
    expect(tableEvent(view(twice), view(s))).toBeNull()
    expect(tableEvent(view(s), view(twice))).toBeNull()
    expect(tableEvent(view(once), view(once))).toBeNull()
    expect(tableEvent(null, view(twice), true)).toBeNull()
  })
  it('synchronizes speed overrides with each timing component', () => {
    expect(effectiveSpeed('normal', true, true)).toBe('fast')
    expect(effectiveSpeed('instant', true, true)).toBe('instant')
    expect(Object.values(timingFor('cinematic', false)).every((ms) => ms === 0)).toBe(true)
    for (const key of Object.keys(timingFor('normal')) as (keyof ReturnType<typeof timingFor>)[]) {
      expect(timingFor('cinematic')[key]).toBeGreaterThan(timingFor('normal')[key])
      expect(timingFor('normal')[key]).toBeGreaterThan(timingFor('fast')[key])
    }
  })
})
