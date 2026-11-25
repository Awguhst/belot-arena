import assert from 'node:assert/strict'
import {
  CONTRACTS,
  SEATS,
  applyCommand,
  createMatch,
  getLegalActions,
  getPlayerView,
  replayGame,
  validateAction,
} from '../../game-engine/src'
import type { Contract, GameAction, GameEvent, GameState } from '../../game-engine/src'
import { chooseDecision } from '../src'
import type { Difficulty } from '../src'
import { cardKey } from '../src/heuristic'

const target = Number(process.argv[2] ?? 10000)
assert(Number.isInteger(target) && target > 0)
const contracts = Object.fromEntries(CONTRACTS.map((contract) => [contract, 0])) as Record<
  Contract,
  number
>
const decisions: Record<Difficulty, number> = { beginner: 0, intermediate: 0, advanced: 0 }
let commands = 0,
  passedOut = 0,
  capots = 0,
  doubles = 0,
  redoubles = 0,
  sampled = 0
const start = performance.now()

function assertDeck(state: GameState) {
  const cards = [
    ...Object.values(state.hands).flat(),
    ...state.stock,
    ...state.trick.map((p) => p.card),
    ...state.tricks.flatMap((trick) => trick.plays.map((p) => p.card)),
  ]
  assert.equal(cards.length, 32, '32 cards in circulation')
  assert.equal(new Set(cards.map(cardKey)).size, 32, 'unique cards in circulation')
}

for (let seed = 1, completed = 0; completed < target; seed++) {
  assert(seed < target * 10 + 100, 'excessive passed-out auctions')
  const initial = createMatch({ dealer: SEATS[seed % 4] }, seed)
  let state = initial
  const events: GameEvent[] = []
  while (state.phase !== 'NEXT_HAND' && state.phase !== 'MATCH_COMPLETE') {
    assert(events.length < 150, 'stalled hand at seed ' + seed)
    assertDeck(state)
    let action: GameAction
    if (state.phase === 'BIDDING' || state.phase === 'PLAYING_TRICK') {
      const view = getPlayerView(state, state.turn)
      for (const field of ['seed', 'stock', 'hands', 'originalHands', 'config']) assert(!(field in view))
      const legal = getLegalActions(view, view.seat)
      assert(legal.length > 0, 'empty decision set')
      const seatIndex = SEATS.indexOf(view.seat)
      const difficulty: Difficulty =
        seed <= 24 && seatIndex === seed % 4
          ? 'advanced'
          : (seatIndex + seed) % 3 === 0
            ? 'beginner'
            : 'intermediate'
      const decision = chooseDecision(view, legal, { difficulty, simulations: 2 })
      decisions[difficulty]++
      if (decision.samples) sampled++
      action = decision.action
    } else action = { type: 'advance', revision: state.revision }
    assert(validateAction(state, action), 'illegal action at seed ' + seed)
    const transition = applyCommand(state, action)
    events.push(transition.event)
    state = transition.state
    commands++
  }
  assertDeck(state)
  assert.deepEqual(replayGame(initial, events), state, 'deterministic replay at seed ' + seed)
  if (!state.result) {
    passedOut++
    continue
  }
  assert.equal(state.tricks.length, 8)
  assert(state.tricks.every((trick) => trick.plays.length === 4))
  const { cardPoints, lastTrick, noTrumpBonus, capot } = state.result
  const base =
    cardPoints.us + cardPoints.them + lastTrick.us + lastTrick.them + noTrumpBonus.us + noTrumpBonus.them
  const expected = state.contract === 'all-trumps' ? 258 : state.contract === 'no-trumps' ? 260 : 162
  assert.equal(base, expected, 'base points at seed ' + seed)
  contracts[state.contract!]++
  if (capot) capots++
  if (state.multiplier === 2) doubles++
  if (state.multiplier === 4) redoubles++
  completed++
}
if (target >= 10000) assert(Object.values(contracts).every((total) => total > 0))
console.log(
  JSON.stringify(
    {
      completed: target,
      passedOut,
      commands,
      contracts,
      decisions,
      simulationDecisions: sampled,
      capots,
      doubledHands: doubles,
      redoubledHands: redoubles,
      elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(2)),
    },
    null,
    2,
  ),
)
