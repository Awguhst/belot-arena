import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createMatch,
  getLegalActions,
  getPlayerView,
  type PlayerView,
} from '@belot/game-engine'
import { assistance, defaults, restoreLocal, withAssistanceMode } from '../store'
import { soundSequence } from './sound'
import { timingFor } from './animationPlan'

describe('table preferences', () => {
  it('opens clean and silent and independently preserves bot deliberation when applying a preset', () => {
    expect(assistance(defaults)).toBe(false)
    expect(defaults.muted).toBe(true)
    expect(defaults.assistanceMode).toBe('standard')
    const study = withAssistanceMode({ ...defaults, speed: 'slow', effectsVolume: 22 }, 'learning')
    expect(study).toMatchObject({ points: true, reasons: true, bidAdvice: true, autoCoach: false })
    const expert = withAssistanceMode({ ...study, autoCoach: true }, 'expert')
    expect(expert).toMatchObject({
      speed: 'slow',
      animationSpeed: 'fast',
      points: false,
      highlights: false,
      reasons: false,
      bidAdvice: false,
      rankings: false,
      autoCoach: false,
      effectsVolume: 22,
    })
  })
  it('restores saved flags from v2 and validates v3 enum and volume values', () => {
    const previous = restoreLocal(
      JSON.stringify({
        version: 2,
        prefs: { speed: 'slow', lang: 'en', highlights: true, motion: false },
      }),
    )
    expect(previous.prefs).toMatchObject({
      speed: 'slow',
      lang: 'en',
      highlights: true,
      motion: false,
      muted: true,
    })
    expect(previous.warning).toBeNull()
    const current = restoreLocal(
      JSON.stringify({
        version: 3,
        prefs: {
          assistanceMode: 'expert',
          animationSpeed: 'broken',
          autoCoach: true,
          points: true,
          masterVolume: 300,
          effectsVolume: -3,
          ambient: true,
        },
      }),
    )
    expect(current.prefs).toMatchObject({
      assistanceMode: 'expert',
      animationSpeed: 'normal',
      autoCoach: false,
      points: false,
      masterVolume: 100,
      effectsVolume: 0,
      ambient: true,
    })
  })
})
describe('public audio events', () => {
  const timed = timingFor('normal')
  it('plays a new opening packet in its visual order and leaves a restored hand silent', () => {
    const view = getPlayerView(createMatch({}, 764), 'south')
    const opening = soundSequence(null, view, timed, true)
    expect(opening[0].cue).toBe('shuffle')
    expect(opening.filter((c) => c.cue === 'deal')).toHaveLength(8)
    expect(opening.at(-1)?.ms).toBe(19 * timed.stagger + timed.deal)
    expect(soundSequence(null, view, timed, false)).toEqual([])
    expect(soundSequence(view, view, timed)).toEqual([])
    expect(soundSequence(null, view, timingFor('instant'), true).map((e) => e.cue)).toEqual([
      'shuffle',
      'deal',
    ])
  })
  it('emits one correctly timed collection and awards cue for a public, completed trick', () => {
    let s = createMatch({ practiceContract: 'hearts' }, 1)
    let prior: PlayerView
    do {
      prior = getPlayerView(s, 'south')
      s = applyAction(s, getLegalActions(s, s.turn)[0])
    } while (s.phase !== 'TRICK_RESOLUTION')
    const view = getPlayerView(s, 'south')
    const sounds = soundSequence(prior, view, timed)
    expect(sounds.filter((e) => e.cue === 'collect')).toEqual([
      { cue: 'collect', ms: timed.play + timed.hold + timed.gather },
    ])
    expect(sounds.some((e) => e.cue === 'points')).toBe(true)
    expect(soundSequence(view, prior, timed)).toEqual([])
  })
  it('distinguishes a bid, contra, and recontra and ignores cross-revision jumps', () => {
    let s = createMatch({}, 1)
    let prev = getPlayerView(s, 'south')
    for (const bid of ['hearts', 'contra', 'recontra'] as const) {
      s = applyAction(s, { type: 'bid', seat: s.turn, revision: s.revision, bid })
      const next = getPlayerView(s, 'south')
      expect(soundSequence(prev, next, timed).map((c) => c.cue)).toEqual([
        bid === 'hearts' ? 'bid' : bid,
      ])
      expect(soundSequence({ ...prev, revision: prev.revision - 1 }, next, timed)).toEqual([])
      prev = next
    }
  })
})
