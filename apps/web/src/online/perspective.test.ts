import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createMatch,
  getLegalActions,
  getPlayerView,
  otherTeam,
  SEATS,
  teamOf,
  type GameAction,
  type TeamPoints,
} from '@belot/game-engine'
import { roomAction, roomSeat, tableAction, tableSeat, tableView } from './perspective'
import { defaults, withAssistanceMode } from '../store'
import { matchPreferences } from './OnlineTable'

describe('online table perspectives', () => {
  for (const viewer of SEATS) {
    it('maps the hand, legal moves, partner and score for ' + viewer, () => {
      let state = createMatch({ target: 51 }, 946)
      let scored = false
      for (let turn = 0; turn < 64 && !scored; turn++) {
        const original = getPlayerView(state, viewer)
        const view = tableView(original)
        expect(view.seat).toBe('south')
        expect(view.hand).toEqual(state.hands[viewer])
        expect(view).not.toHaveProperty('hands')
        expect(view).not.toHaveProperty('stock')
        for (const absolute of SEATS) {
          const relative = tableSeat(absolute, viewer)
          expect(view.counts[relative]).toBe(state.hands[absolute].length)
          expect(roomSeat(relative, viewer)).toBe(absolute)
          expect(teamOf(relative) === 'us').toBe(teamOf(absolute) === teamOf(viewer))
        }
        const serverActions = getLegalActions(original, viewer)
        const permitted = serverActions.map((action) => tableAction(action, viewer))
        expect(getLegalActions(view, 'south')).toEqual(permitted)
        expect(permitted.map((action) => roomAction(action, viewer))).toEqual(serverActions)
        expect(view.tricks.map((trick) => roomSeat(trick.winner, viewer))).toEqual(
          original.tricks.map((trick) => trick.winner),
        )
        if (view.result && state.result) {
          const ourTeam = teamOf(viewer),
            theirTeam = otherTeam(ourTeam)
          expect(view.scores).toEqual({ us: state.scores[ourTeam], them: state.scores[theirTeam] })
          for (const key of [
            'cardPoints',
            'declarations',
            'belots',
            'lastTrick',
            'awarded',
            'capotBonus',
            'noTrumpBonus',
            'raw',
            'hangingAwarded',
          ] as const) {
            const points: TeamPoints = state.result[key]
            expect(view.result[key]).toEqual({ us: points[ourTeam], them: points[theirTeam] })
          }
          scored = true
          continue
        }
        const choices = getLegalActions(state, state.turn)
        const action: GameAction =
          state.phase === 'BIDDING'
            ? {
                type: 'bid',
                revision: state.revision,
                seat: state.turn,
                bid: state.contract ? 'pass' : 'no-trumps',
              }
            : (choices[0] ?? { type: 'advance', revision: state.revision })
        state = applyAction(state, action)
      }
      expect(scored).toBe(true)
    })
  }
  it('enforces strategic and basic room assistance independently of saved preferences', () => {
    const local = {
      ...withAssistanceMode(defaults, 'learning'),
      autoCoach: true,
      tracker: true,
      rankings: true,
    }
    const basicOnly = matchPreferences(local, false, true)
    expect(basicOnly).toMatchObject({
      highlights: true,
      points: true,
      autoCoach: false,
      bidAdvice: false,
      autoDeclare: false,
      undo: false,
    })
    const hintsOnly = matchPreferences(local, true, false)
    expect(hintsOnly).toMatchObject({
      highlights: false,
      points: false,
      rankings: false,
      tracker: false,
      autoCoach: true,
      bidAdvice: true,
      undo: false,
    })
    expect(local.undo).toBe(true)
  })
})
