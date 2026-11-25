import type { GameAction, PlayerView } from '../../game-engine/src'
import type { DecisionReason } from './reasons'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface BotContext {
  difficulty: Difficulty
  /** Optional independent decision stream for repeatable tournaments. */
  decisionSeed?: number
  /** Number of hypothetical deals shared by all candidate actions. */
  simulations?: number
}

export interface BotDecision {
  action: GameAction
  mandatory: boolean
  reason: DecisionReason
  alternative?: GameAction
  samples?: number
}

export interface BotAgent {
  chooseAction(view: PlayerView, legalActions: GameAction[], context: BotContext): Promise<BotDecision>
}

export type DecisionGrade = 'recommended' | 'good' | 'reasonable' | 'questionable' | 'potential-mistake'
