import { describe, expect, it } from 'vitest'
import { applyAction, createMatch, getLegalActions } from '@belot/game-engine'
import type { GameAction, GameState } from '@belot/game-engine'
import type { MatchRecord, ReviewedHand } from './session'
import { summarizeStatistics } from './Statistics'

function completeHand(practice: boolean): GameState {
  let state = createMatch(practice ? { practiceContract: 'hearts', target: 1 } : { target: 1 }, 447)
  while (state.phase !== 'NEXT_HAND' && state.phase !== 'MATCH_COMPLETE') {
    let action: GameAction
    if (state.phase === 'BIDDING') {
      const bid = state.contract === null ? 'hearts' : 'pass'
      action = { type: 'bid', seat: state.turn, bid, revision: state.revision }
    } else if (state.phase === 'PLAYING_TRICK') action = getLegalActions(state, state.turn)[0]
    else action = { type: 'advance', revision: state.revision }
    state = applyAction(state, action)
  }
  return state
}

describe('local statistics', () => {
  it('filters assisted hands, deduplicates records and excludes prescribed practice contracts from personal bids', () => {
    const normal = completeHand(false)
    const practice = completeHand(true)
    const makeHand = (id: string, final: GameState, assisted: boolean): ReviewedHand => ({
      id: id + '/1',
      date: '2026-01-04T12:00:00Z',
      matchId: id,
      frames: [],
      final,
      assisted,
    })
    const a = makeHand('one', normal, false),
      b = makeHand('two', practice, true)
    const record: MatchRecord = {
      version: 1,
      ruleset: normal.ruleset,
      id: 'two',
      date: b.date,
      config: practice.config,
      seed: practice.seed,
      events: [],
      assisted: true,
      hints: 3,
      difficulty: 'beginner',
    }
    const all = summarizeStatistics([a, b, a], [record, record], 'all')
    expect(all.hands).toBe(2)
    expect(all.hints).toBe(3)
    expect(all.contractRows.hearts.played).toBe(2)
    expect(all.declared).toBe(1)
    expect(all.days).toHaveLength(1)
    expect(all.days[0].hands).toBe(2)
    expect(summarizeStatistics([a, b], [record], 'assisted')).toMatchObject({
      hands: 1,
      declared: 0,
      hints: 3,
    })
    expect(summarizeStatistics([a, b], [record], 'unassisted')).toMatchObject({
      hands: 1,
      declared: 1,
      hints: 0,
    })
  })
})
