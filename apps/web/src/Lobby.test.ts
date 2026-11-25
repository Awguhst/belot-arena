import { expect, it, vi } from 'vitest'
import * as engine from '@belot/game-engine'
import { recentScoredMatches } from './Lobby'
import type { MatchRecord } from './session'

it('replays only the three recent scored matches and reuses their summaries on a return to the lobby', () => {
  const record: MatchRecord = {
    id: 'base',
    version: 1,
    ruleset: engine.RULESET,
    seed: 14,
    date: '2026-01-01T00:00:00Z',
    config: { target: 151, practiceContract: 'hearts' },
    difficulty: 'beginner',
    events: [],
    hints: 0,
    assisted: true,
  }
  let state = engine.createMatch(record.config, record.seed)
  while (!state.result) {
    const action = engine.getLegalActions(state, state.turn)[0] ?? {
      type: 'advance',
      revision: state.revision,
    }
    const step = engine.applyCommand(state, action)
    record.events.push(step.event)
    state = step.state
  }
  const expectedScore = state.scores
  const archived = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ ...record, id }))
  const recentCopy = { ...archived[2], date: '2026-01-02T00:00:00Z' }
  const unfinished = { ...record, id: 'incomplete', events: record.events.slice(0, -1) }
  const passedOut = { ...record, id: 'all-pass', config: {}, events: [] as engine.GameEvent[] }
  let auction = engine.createMatch(passedOut.config, passedOut.seed)
  while (auction.phase === 'BIDDING') {
    const step = engine.applyCommand(auction, {
      type: 'bid',
      seat: auction.turn,
      bid: 'pass',
      revision: auction.revision,
    })
    passedOut.events.push(step.event)
    auction = step.state
  }
  const replay = vi.spyOn(engine, 'replayGame')
  try {
    expect(recentScoredMatches([passedOut, unfinished])).toEqual([])
    const records = [...archived, recentCopy, unfinished, passedOut]
    const recent = recentScoredMatches(records)
    expect(recent.map((row) => row.id)).toEqual(['E/1', 'D/1', 'C/1'])
    expect(recent[2]).toMatchObject({ scores: expectedScore, date: recentCopy.date })
    expect(replay).toHaveBeenCalledTimes(3)
    expect(recentScoredMatches(records)).toEqual(recent)
    expect(replay).toHaveBeenCalledTimes(3)
  } finally {
    replay.mockRestore()
  }
})
