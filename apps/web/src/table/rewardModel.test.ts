import { describe, expect, it } from 'vitest'
import {
  BELOT_BONUS,
  applyAction,
  createMatch,
  getLegalActions,
  type GameState,
  type TeamPoints,
} from '@belot/game-engine'
import { capturedPoints, newPublicNotices, scoreRows, summarizeMatch } from './rewardModel'

function complete(contract: 'hearts' | 'no-trumps' | 'all-trumps', seed = 3) {
  let state = createMatch({ practiceContract: contract }, seed)
  while (!state.result) {
    const action = getLegalActions(state, state.turn)[0] ?? { type: 'advance', revision: state.revision }
    state = applyAction(state, action)
  }
  return state
}
describe('public score presentation', () => {
  it.each(['hearts', 'no-trumps', 'all-trumps'] as const)(
    'keeps captured card points separate under %s',
    (contract) => {
      const state = complete(contract)
      expect(capturedPoints(state)).toEqual(state.result!.cardPoints)
      const rows = scoreRows(state.result!)
      expect(rows[0]).toEqual({ key: 'cardPoints', points: state.result!.cardPoints })
      expect(rows.at(-1)).toEqual({ key: 'awarded', points: state.result!.awarded })
      expect(rows.some((row) => row.key === 'noTrumpBonus')).toBe(contract === 'no-trumps')
      expect(rows.find((row) => row.key === 'lastTrick')).toEqual({
        key: 'lastTrick',
        points: state.result!.lastTrick,
      })
    },
  )
  it('shows the original carry, allocation, multiplier and new carry as separate rows', () => {
    const result = {
      ...complete('all-trumps').result!,
      multiplier: 2 as const,
      hangingBefore: 12,
      hangingAfter: 64,
      hangingAwarded: { us: 0, them: 0 },
    }
    const rows = scoreRows(result)
    expect(rows).toContainEqual({ key: 'multiplier', value: 2 })
    expect(rows).toContainEqual({ key: 'hangingBefore', value: 12 })
    expect(rows).toContainEqual({ key: 'hangingAfter', value: 64 })
    expect(rows.some((row) => row.key === 'hangingAwarded')).toBe(false)
  })
  it('announces only new public combinations and distinguishes announcement from resolution', () => {
    const start = createMatch({ practiceContract: 'hearts' }, 1)
    const available = getLegalActions(start, 'south')
    const after = applyAction(start, available[0]!)
    const notices = newPublicNotices(start, after)
    expect(notices).toContainEqual({ kind: 'declaration', ...after.declarations[0] })
    expect(notices.some((n) => n.kind === 'resolved')).toBe(false)
    let fourth: GameState = after
    while (fourth.phase === 'PLAYING_TRICK')
      fourth = applyAction(fourth, getLegalActions(fourth, fourth.turn)[0]!)
    const collected = applyAction(fourth, { type: 'advance', revision: fourth.revision })
    expect(newPublicNotices(fourth, collected)).toContainEqual({
      kind: 'resolved',
      points: collected.declarationPoints,
    })
    expect(newPublicNotices(null, collected)).toEqual([])
    expect(newPublicNotices(collected, fourth)).toEqual([])
    expect(newPublicNotices(start, collected)).toEqual([])
    expect(newPublicNotices(collected, collected)).toEqual([])
  })
  it('uses the published engine award for each scored Belot', () => {
    const state = complete('hearts')
    const expected: TeamPoints = { us: 0, them: 0 }
    for (const { seat } of state.belots)
      expected[seat === 'south' || seat === 'north' ? 'us' : 'them'] += BELOT_BONUS
    expect(expected).toEqual(state.result!.belots)
  })
  it('summarizes only scored hands, with ties excluded from hands won', () => {
    const closed = complete('no-trumps')
    const pending = createMatch({}, 3)
    const summary = summarizeMatch([
      closed,
      { ...closed, result: { ...closed.result!, raw: { us: 150, them: 150 } } },
      pending,
    ])
    expect(summary.hands).toBe(2)
    expect(summary.won).toBe(Number(closed.result!.raw.us > closed.result!.raw.them))
    expect(summary.tricks).toBe(
      closed.tricks.filter((tr) => ['south', 'north'].includes(tr.winner)).length * 2,
    )
  })
})
