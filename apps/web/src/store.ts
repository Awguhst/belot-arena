import { create } from 'zustand'
import type { GameAction, MatchConfig } from '@belot/game-engine'
import type { Difficulty } from '@belot/bots'
import { LocalSession, type MatchRecord } from './session'

export type Lang = 'bg' | 'en'
export type AssistanceMode = 'learning' | 'standard' | 'expert'
export type AnimationSpeed = 'cinematic' | 'normal' | 'fast' | 'instant'
export interface Preferences {
  lang: Lang
  difficulty: Difficulty
  target: 51 | 101 | 151
  speed: 'slow' | 'normal' | 'fast'
  motion: boolean
  highlights: boolean
  reasons: boolean
  points: boolean
  rankings: boolean
  autoDeclare: boolean
  tracker: boolean
  winning: boolean
  bidAdvice: boolean
  undo: boolean
  assistanceMode: AssistanceMode
  animationSpeed: AnimationSpeed
  autoCoach: boolean
  muted: boolean
  masterVolume: number
  effectsVolume: number
  ambient: boolean
}
export const defaults: Preferences = {
  lang: 'bg',
  difficulty: 'intermediate',
  target: 151,
  speed: 'normal',
  motion: true,
  highlights: false,
  reasons: false,
  points: false,
  rankings: false,
  autoDeclare: false,
  tracker: false,
  winning: false,
  bidAdvice: false,
  undo: true,
  assistanceMode: 'standard',
  animationSpeed: 'normal',
  autoCoach: false,
  muted: true,
  masterVolume: 65,
  effectsVolume: 70,
  ambient: false,
}
export const expertRestricted = [
  'highlights',
  'reasons',
  'points',
  'rankings',
  'bidAdvice',
  'autoCoach',
  'winning',
] as const
export function withAssistanceMode(prefs: Preferences, assistanceMode: AssistanceMode): Preferences {
  const learning = assistanceMode === 'learning'
  return {
    ...prefs,
    assistanceMode,
    highlights: learning,
    reasons: learning,
    points: learning,
    winning: learning,
    bidAdvice: learning,
    autoDeclare: learning,
    autoCoach: learning && prefs.autoCoach,
    rankings: false,
    tracker: false,
    animationSpeed:
      assistanceMode === 'expert'
        ? 'fast'
        : prefs.assistanceMode === 'expert' && prefs.animationSpeed === 'fast'
          ? 'normal'
          : prefs.animationSpeed,
  }
}
export const assistance = (p: Preferences) =>
  p.highlights ||
  p.reasons ||
  p.points ||
  p.rankings ||
  p.autoDeclare ||
  p.tracker ||
  p.winning ||
  p.bidAdvice ||
  p.autoCoach
const key = 'belot.club.session'
const archivePrefix = 'belot.club.archive.'
interface ArchiveRef {
  id: string
  archive: string
}
type SavedHandHistory = (ArchiveRef | MatchRecord)[]
const archiveRef = new WeakMap<MatchRecord, ArchiveRef>()
const savedHistory = new WeakMap<MatchRecord[], SavedHandHistory>()

export function restoreLocal(
  raw: string | null,
  storage?: Pick<Storage, 'getItem'>,
  knownHistory: MatchRecord[] = [],
) {
  const fallback = {
    prefs: { ...defaults },
    active: null as LocalSession | null,
    history: [] as MatchRecord[],
    warning: null as 'corrupt' | 'storage' | null,
  }
  if (!raw) return fallback
  try {
    const data = JSON.parse(raw)
    // Version 1 stored preferences under "preferences" and the active replay under "match".
    if (data.version === 1) {
      data.prefs = data.preferences ?? data.prefs
      data.active = data.match ?? data.active
      data.version = 2
    }
    // v3 adds presentation preferences. Keep all v2 explicit assistance flags and match events.
    if (data.version === 2) data.version = 3
    if (![3, 4].includes(data.version) || !Array.isArray(data.history ?? []))
      throw new Error('Unknown save')
    const prefs = { ...defaults }
    for (const k of Object.keys(defaults) as (keyof Preferences)[]) {
      if (typeof defaults[k] === 'boolean' && typeof data.prefs?.[k] === 'boolean')
        Object.assign(prefs, { [k]: data.prefs[k] })
    }
    for (const [k, values] of Object.entries({
      lang: ['en', 'bg'],
      target: [51, 101, 151],
      difficulty: ['beginner', 'intermediate', 'advanced'],
      speed: ['slow', 'normal', 'fast'],
      animationSpeed: ['cinematic', 'normal', 'fast', 'instant'],
      assistanceMode: ['learning', 'standard', 'expert'],
    })) {
      if ((values as unknown[]).includes(data.prefs?.[k])) Object.assign(prefs, { [k]: data.prefs[k] })
    }
    for (const key of ['masterVolume', 'effectsVolume'] as const) {
      if (Number.isFinite(data.prefs?.[key]))
        prefs[key] = Math.max(0, Math.min(100, Math.round(data.prefs[key])))
    }
    if (prefs.assistanceMode === 'expert') for (const key of expertRestricted) prefs[key] = false
    fallback.prefs = prefs
    // A move in another tab changes the active replay. Validated immutable archives can be reused.
    const known = new Map(knownHistory.map((record) => [archiveRef.get(record)?.archive, record]))
    const entries: SavedHandHistory = []
    for (const entry of data.history ?? []) {
      try {
        let record: MatchRecord = entry
        if (data.version === 4 && typeof entry?.archive === 'string') {
          const cached = known.get(entry.archive)
          if (cached) record = cached
          else {
            const archived = storage?.getItem(archivePrefix + entry.archive)
            if (!archived) throw new Error('Missing archived match')
            record = JSON.parse(archived)
            LocalSession.restore(record)
          }
          if (record.id !== entry.id) throw new Error('Mismatched archived match')
          archiveRef.set(record, { id: record.id, archive: entry.archive })
        } else LocalSession.restore(record)
        entries.push(archiveRef.get(record) ?? record)
        fallback.history.push(record)
      } catch {
        fallback.warning = 'corrupt'
      }
    }
    if (data.version === 4) savedHistory.set(fallback.history, entries)
    if (data.active) fallback.active = LocalSession.restore(data.active)
    return fallback
  } catch {
    return { ...fallback, warning: 'corrupt' as const }
  }
}
function load() {
  try {
    return restoreLocal(localStorage.getItem(key), localStorage)
  } catch {
    return { ...restoreLocal(null), warning: 'storage' as const }
  }
}
interface ClubState extends ReturnType<typeof load> {
  setPref<K extends keyof Preferences>(key: K, value: Preferences[K], table?: 'offline' | 'online'): void
  start(config: MatchConfig, difficulty: Difficulty): void
  dispatch(action: GameAction, expected: LocalSession): void
  hint(): void
  undoTurn(): void
  dismissWarning(): void
}
function saveLocal({ active, history, prefs }: Pick<ClubState, 'active' | 'history' | 'prefs'>) {
  const write = (entries: SavedHandHistory) =>
    localStorage.setItem(
      key,
      JSON.stringify({ version: 4, active: active?.record ?? null, history: entries, prefs }),
    )
  const existing = savedHistory.get(history)
  if (existing) {
    write(existing)
    return
  }
  const previous = history.map((record) => archiveRef.get(record) ?? record)
  const staged: { record: MatchRecord; ref: ArchiveRef }[] = []
  try {
    const entries = history.map((record) => {
      const reused = archiveRef.get(record)
      if (reused) return reused
      const ref = { id: record.id, archive: crypto.randomUUID() }
      localStorage.setItem(archivePrefix + ref.archive, JSON.stringify(record))
      staged.push({ record, ref })
      return ref
    })
    // The single manifest write publishes the complete snapshot after every archive exists.
    write(entries)
    for (const { record, ref } of staged) archiveRef.set(record, ref)
    savedHistory.set(history, entries)
  } catch {
    // Existing single-key saves near quota may have no temporary room for an archive copy.
    for (const { ref } of staged) localStorage.removeItem(archivePrefix + ref.archive)
    write(previous)
    savedHistory.set(history, previous)
  }
}
export const useClub = create<ClubState>((set, get) => {
  function persist(update: Partial<ClubState>) {
    const next = { ...get(), ...update }
    try {
      saveLocal(next)
    } catch {
      update.warning = 'storage'
    }
    set(update)
  }
  return {
    ...load(),
    dismissWarning: () => set({ warning: null }),
    setPref: (key, value, table = 'offline') => {
      const old = get().prefs
      if (
        old.assistanceMode === 'expert' &&
        expertRestricted.some((feature) => feature === key) &&
        value === true
      )
        return
      const prefs =
        key === 'assistanceMode'
          ? withAssistanceMode(old, value as AssistanceMode)
          : { ...old, [key]: value }
      const live = get().active
      persist({
        prefs,
        active:
          table === 'offline' &&
          live &&
          live.view('south').phase !== 'MATCH_COMPLETE' &&
          assistance(prefs) &&
          !live.record.assisted
            ? live.assist()
            : live,
      })
    },
    start: (config, difficulty) => {
      const old = get().active
      const history = old && old.record.events.length ? [...get().history, old.record] : get().history
      persist({
        history,
        active: LocalSession.start(
          config,
          difficulty,
          assistance(get().prefs) || !!config.practiceContract,
        ),
      })
    },
    dispatch: (action, expected) => {
      if (get().active !== expected) return
      const session = !expected.record.assisted && assistance(get().prefs) ? expected.assist() : expected
      persist({ active: session.submit(action) })
    },
    hint: () => {
      const active = get().active
      if (active) persist({ active: active.assist(true) })
    },
    undoTurn: () => {
      const s = get()
      if (s.prefs.undo && s.active) persist({ active: s.active.undo() })
    },
  }
})
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === key)
      useClub.setState(restoreLocal(e.newValue, localStorage, useClub.getState().history))
  })
