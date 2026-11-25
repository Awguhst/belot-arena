import type { GameAction, PlayerView } from '../../../packages/game-engine/src'
import { chooseHeuristic, sameDecision } from '../../../packages/bots/src'
import type { BotContext, BotDecision } from '../../../packages/bots/src'

export async function chooseAction(
  view: PlayerView,
  actions: GameAction[],
  context: BotContext,
  signal: AbortSignal,
): Promise<BotDecision | null> {
  if (signal.aborted) return null
  const fallback = () => chooseHeuristic(view, actions, context)
  if (context.difficulty !== 'advanced' || actions.length <= 1 || typeof Worker === 'undefined')
    return fallback()
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../../../packages/bots/src/worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      resolve(fallback())
      return
    }
    function cancel() {
      finish(null)
    }
    function finish(decision: BotDecision | null) {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      worker.terminate()
      resolve(decision)
    }
    const timeout = setTimeout(() => finish(fallback()), 6500)
    signal.addEventListener('abort', cancel, { once: true })
    worker.onerror = () => finish(fallback())
    worker.onmessageerror = () => finish(fallback())
    worker.onmessage = (event: MessageEvent<BotDecision>) => {
      const decision = event.data
      const legal = decision?.action && actions.find((action) => sameDecision(action, decision.action))
      finish(legal ? { ...decision, action: legal } : fallback())
    }
    try {
      worker.postMessage({ view, actions, context })
    } catch {
      finish(fallback())
    }
  })
}
