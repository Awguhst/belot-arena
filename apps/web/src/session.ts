import {
  RULESET,
  applyCommand,
  createMatch,
  getPlayerView,
  replayGame,
  getLegalActions,
  type GameState,
  type GameAction,
  type MatchConfig,
  type Replay,
  type Seat,
} from '@belot/game-engine'
import type { Difficulty } from '@belot/bots'

export interface MatchRecord extends Replay {
  id: string
  date: string
  difficulty: Difficulty
  hints: number
  assisted: boolean
}
export interface ReviewedHand {
  id: string
  matchId: string
  date: string
  assisted: boolean
  frames: { state: GameState; action: GameAction | null }[]
  final: GameState
}
export interface GameSession {
  view(seat: Seat): ReturnType<typeof getPlayerView>
  legal(seat: Seat): GameAction[]
  submit(action: GameAction): GameSession
}
/** The local authority is the only live object that holds the shuffled deal. */
export class LocalSession implements GameSession {
  private constructor(
    readonly record: MatchRecord,
    private readonly current: GameState,
    /** Transient creation signal. Rehydration and undo never replay the opening deal. */
    readonly openingDeal = false,
  ) {}
  static start(config: MatchConfig, difficulty: Difficulty, assisted: boolean) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const state = createMatch(config, seed)
    return new LocalSession(
      {
        version: 1,
        ruleset: RULESET,
        seed,
        config,
        events: [],
        difficulty,
        assisted,
        hints: 0,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
      },
      state,
      true,
    )
  }
  static restore(record: MatchRecord) {
    if (
      !record ||
      record.version !== 1 ||
      record.ruleset !== RULESET ||
      !Array.isArray(record.events) ||
      typeof record.id !== 'string' ||
      !Number.isFinite(Date.parse(record.date)) ||
      !['beginner', 'intermediate', 'advanced'].includes(record.difficulty) ||
      typeof record.assisted !== 'boolean' ||
      !Number.isSafeInteger(record.hints) ||
      record.hints < 0
    )
      throw new Error('Invalid local match')
    return new LocalSession(record, replayGame(createMatch(record.config, record.seed), record.events))
  }
  view(seat: Seat) {
    return getPlayerView(this.current, seat)
  }
  legal(seat: Seat) {
    return getLegalActions(this.view(seat), seat)
  }
  submit(action: GameAction) {
    const { state, event } = applyCommand(this.current, action)
    return new LocalSession({ ...this.record, events: [...this.record.events, event] }, state)
  }
  assist(hint = false) {
    return new LocalSession(
      { ...this.record, assisted: true, hints: this.record.hints + Number(hint) },
      this.current,
    )
  }
  get undoIndex() {
    return this.record.events.findLastIndex(
      (e) => e.action.type !== 'advance' && e.action.seat === 'south',
    )
  }
  undo() {
    const index = this.undoIndex
    return index < 0
      ? this
      : LocalSession.restore({
          ...this.record,
          assisted: true,
          events: this.record.events.slice(0, index),
        })
  }
}
/** Private cards are released for review only after the scoring transition has closed a hand. */
export function completedHands(record: MatchRecord): ReviewedHand[] {
  let state = createMatch(record.config, record.seed)
  let frames: ReviewedHand['frames'] = [{ state, action: null }]
  const result: ReviewedHand[] = []
  for (const event of record.events) {
    const previous = state
    state = replayGame(state, [event])
    if (state.handNumber !== previous.handNumber) frames = [{ state, action: null }]
    else frames.push({ state, action: event.action })
    if (state.result && previous.phase === 'HAND_SCORING') {
      result.push({
        id: record.id + '/' + state.handNumber,
        matchId: record.id,
        date: record.date,
        assisted: record.assisted,
        frames,
        final: state,
      })
    }
  }
  return result
}
