import {
  applyAction,
  cardPoints,
  cardStrength,
  determineTrickWinner,
  getLegalActions,
  getPlayerView,
  teamOf,
} from '../../game-engine/src'
import type { GameAction, GameState, PlayerView, Team } from '../../game-engine/src'
import { chooseHeuristic, decisionSeed, sameDecision } from './heuristic'
import { prepareSampler } from './inference'
import { randomStream } from './random'
import type { BotContext, BotDecision } from './types'

/** Rollout policy is deliberately cheaper than the production intermediate policy. */
function rolloutChoice(view: PlayerView, actions: GameAction[]): GameAction {
  if (actions.length === 1) return actions[0]
  if (actions[0].type === 'bid') return chooseHeuristic(view, actions).action
  const contract = view.contract!
  let best = actions[0]
  let bestScore = -Infinity
  const leading = view.trick.length === 0
  const partnerWinning =
    !leading && teamOf(determineTrickWinner(view.trick, contract)) === teamOf(view.seat)
  for (const action of actions) {
    if (action.type !== 'play') continue
    const strength = cardStrength(action.card, contract)
    const points = cardPoints(action.card, contract)
    let score = strength >= 6 ? strength + points : -points
    if (!leading) {
      const wins =
        determineTrickWinner([...view.trick, { card: action.card, seat: view.seat }], contract) ===
        view.seat
      if (wins && !partnerWinning) score = 45 - strength
      else if (partnerWinning && !wins) score = points - strength * 0.3
      else score = -points - strength * 0.4
    }
    if (score > bestScore) {
      best = action
      bestScore = score
    }
  }
  return best
}

function remainingHand(world: GameState, action: GameAction, team: Team): number {
  let state = applyAction(world, action)
  for (let i = 0; i < 150; i++) {
    if (state.phase === 'NEXT_HAND' || state.phase === 'MATCH_COMPLETE') {
      if (!state.result) return 0
      const other = team === 'us' ? 'them' : 'us'
      return state.result.awarded[team] - state.result.awarded[other]
    }
    if (state.phase === 'INITIAL_DEAL' || state.handNumber !== world.handNumber) return 0
    if (state.phase === 'PLAYING_TRICK' || state.phase === 'BIDDING') {
      const options = getLegalActions(state, state.turn)
      const choice = rolloutChoice(getPlayerView(state, state.turn), options)
      state = applyAction(state, choice)
    } else state = applyAction(state, { type: 'advance', revision: state.revision })
  }
  throw new Error('Unfinished simulation')
}

export function chooseDecision(
  view: PlayerView,
  actions: GameAction[],
  context: BotContext = { difficulty: 'intermediate' },
): BotDecision {
  const fallback = chooseHeuristic(view, actions, context)
  if (context.difficulty !== 'advanced' || actions.length < 2) return fallback
  const sample = prepareSampler(view)
  const random = randomStream(decisionSeed(view, context))
  const budget = Math.min(64, Math.max(0, Math.floor(context.simulations ?? 8)))
  const evaluations = actions.map((action) => ({ action, score: 0 }))
  let count = 0
  for (; count < budget; count++) {
    const world = sample(random)
    if (!world) break
    for (const item of evaluations) item.score += remainingHand(world, item.action, teamOf(view.seat))
  }
  if (!count) return fallback
  // For equal sampled returns, favor the public-information policy.
  evaluations.sort(
    (a, b) =>
      b.score - a.score ||
      Number(sameDecision(b.action, fallback.action)) - Number(sameDecision(a.action, fallback.action)),
  )
  const [best, second] = evaluations
  return {
    action: best.action,
    reason: 'simulation',
    mandatory: false,
    samples: count,
    alternative: second && (best.score - second.score) / count <= 2 ? second.action : undefined,
  }
}
