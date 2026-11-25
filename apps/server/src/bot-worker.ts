import { parentPort } from 'node:worker_threads'
import { chooseDecision } from '../../../packages/bots/src'
import type { GameAction, PlayerView } from '../../../packages/game-engine/src'

parentPort!.on('message', ({ view, legal }: { view: PlayerView; legal: GameAction[] }) => {
  parentPort!.postMessage(chooseDecision(view, legal, { difficulty: 'advanced', simulations: 4 }).action)
})
