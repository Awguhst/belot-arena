import type { GameAction, PlayerView } from '../../game-engine/src'
import { chooseDecision } from './simulation'
import type { BotContext } from './types'

self.onmessage = (
  event: MessageEvent<{ view: PlayerView; actions: GameAction[]; context: BotContext }>,
) => {
  const { view, actions, context } = event.data
  self.postMessage(chooseDecision(view, actions, context))
}
