import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalSession, completedHands, type MatchRecord } from '../apps/web/src/session'
import { restoreLocal, useClub } from '../apps/web/src/store'
import { RULESET } from '@belot/game-engine'

const record = (practice = false): MatchRecord => ({
  version: 1,
  ruleset: RULESET,
  config: practice ? { practiceContract: 'hearts' } : {},
  seed: 478,
  events: [],
  difficulty: 'intermediate',
  hints: 0,
  assisted: false,
  id: 'test-match',
  date: '2026-01-01T12:00:00.000Z',
})

describe('local replay archives', () => {
  const original = useClub.getState()
  const key = 'belot.club.session'
  function setup() {
    const items = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => items.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        items.set(key, value)
      }),
      removeItem: (key: string) => items.delete(key),
    }
    vi.stubGlobal('localStorage', storage)
    let old = LocalSession.restore(record(true))
    old = old.submit(old.legal('south')[0])
    const raw = JSON.stringify({
      version: 3,
      active: record(true),
      history: [old.record],
      prefs: { lang: 'en' },
    })
    items.set(key, raw)
    useClub.setState(restoreLocal(raw, storage))
    return { storage, items, old }
  }
  afterEach(() => {
    useClub.setState(original)
    vi.unstubAllGlobals()
  })
  it('starts and archives matches when a browser on the LAN only provides getRandomValues', () => {
    const browserRandom = crypto.getRandomValues.bind(crypto)
    vi.stubGlobal('crypto', { getRandomValues: browserRandom })
    const { items } = setup()
    useClub.getState().start({ target: 51 }, 'beginner')
    const saved = JSON.parse(items.get(key)!)
    expect(saved.active.id).toMatch(/^[0-9a-f]{32}$/)
    expect(items.has('belot.club.archive.' + saved.history[0].archive)).toBe(true)
    expect(useClub.getState().warning).toBeNull()
  })
  it('writes each archived replay once and reuses a validated record for another tab’s move', () => {
    const { storage, items, old } = setup()
    const active = useClub.getState().active!
    useClub.getState().dispatch(active.legal('south')[0], active)
    const manifest = JSON.parse(items.get(key)!)
    expect(manifest.version).toBe(4)
    expect(manifest.history).toEqual([{ id: old.record.id, archive: expect.any(String) }])
    expect(restoreLocal(items.get(key)!, storage).history[0]).toEqual(old.record)
    storage.setItem.mockClear()
    const next = useClub.getState().active!
    useClub.getState().dispatch(next.legal(next.view('south').turn)[0], next)
    expect(storage.setItem.mock.calls.map(([name]) => name)).toEqual([key])
    storage.getItem.mockClear()
    const previous = useClub.getState().history
    const loaded = restoreLocal(items.get(key)!, storage, previous)
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(loaded.history[0]).toBe(previous[0])
    expect(loaded.active?.view('south')).toEqual(useClub.getState().active?.view('south'))
    items.delete('belot.club.archive.' + manifest.history[0].archive)
    const damaged = restoreLocal(items.get(key)!, storage)
    expect(damaged.warning).toBe('corrupt')
    expect(damaged.active?.record.events).toHaveLength(2)
  })
  it('preserves the idle offline match when an online guest changes assistance', () => {
    const { items } = setup()
    const paused = useClub.getState().active!
    useClub.getState().setPref('points', true, 'online')
    expect(useClub.getState().active).toBe(paused)
    expect(JSON.parse(items.get(key)!).active.assisted).toBe(false)
    useClub.getState().dispatch(paused.legal('south')[0], paused)
    expect(useClub.getState().active?.record.assisted).toBe(true)
  })
  it('keeps an inline archive if quota prevents publishing the migrated references', () => {
    const { storage, items, old } = setup()
    storage.setItem.mockImplementation((name, value) => {
      if (name === key && JSON.parse(value).history[0]?.archive) throw new Error('Quota exceeded')
      items.set(name, value)
    })
    useClub.getState().setPref('points', true)
    expect([...items.keys()]).toEqual([key])
    const saved = restoreLocal(items.get(key)!, storage)
    expect(saved.warning).toBeNull()
    expect(saved.prefs.points).toBe(true)
    expect(saved.history[0]).toEqual(old.record)
    expect(saved.active?.record.id).toBe(record().id)
  })
})
describe('local session', () => {
  it('restores the exact partially played hand without scheduling or scoring a second action', () => {
    let s = LocalSession.restore(record(true))
    for (let n = 0; n < 3; n++) s = s.submit(s.legal(s.view('south').turn)[0])
    const restored = LocalSession.restore(JSON.parse(JSON.stringify(s.record)))
    expect(restored.view('south')).toEqual(s.view('south'))
    expect(restored.record.events).toHaveLength(3)
    expect(completedHands(restored.record)).toEqual([])
  })
  it('undo removes the last human decision and subsequent bot actions', () => {
    const first = LocalSession.restore(record(true))
    let s = first
    for (let n = 0; n < 4; n++) s = s.submit(s.legal(s.view('south').turn)[0])
    const undone = s.undo()
    expect(undone.view('south')).toEqual(first.view('south'))
    expect(undone.record.events).toEqual([])
    expect(undone.record.assisted).toBe(true)
  })
  it('exposes full review hands only after scoring, once per completed hand', () => {
    let s = LocalSession.restore(record(true))
    while (s.view('south').phase !== 'HAND_SCORING') {
      const v = s.view('south')
      s = s.submit(s.legal(v.turn)[0] ?? { type: 'advance', revision: v.revision })
    }
    expect(completedHands(s.record)).toEqual([])
    s = s.submit({ type: 'advance', revision: s.view('south').revision })
    expect(completedHands(s.record)).toHaveLength(1)
    const scores = s.view('south').scores
    s = LocalSession.restore(JSON.parse(JSON.stringify(s.record)))
    expect(s.view('south').scores).toEqual(scores)
    s = s.submit({ type: 'advance', revision: s.view('south').revision })
    expect(completedHands(s.record)).toHaveLength(1)
    expect(s.view('south').scores).toEqual(scores)
  })
  it('migrates version-one preferences and preserves independent readable records', () => {
    const current = restoreLocal(
      JSON.stringify({
        version: 1,
        preferences: { lang: 'en' },
        match: record(),
        history: [null, record()],
      }),
    )
    expect(current.prefs.lang).toBe('en')
    expect(current.active?.view('south').phase).toBe('BIDDING')
    expect(current.history).toHaveLength(1)
    expect(current.warning).toBe('corrupt')
  })
  it('rejects a stale or altered replay and recovers from broken JSON', () => {
    const s = LocalSession.restore(record())
    const a = s.legal('south')[0]
    const next = s.submit(a)
    expect(() => next.submit(a)).toThrow()
    expect(() =>
      LocalSession.restore({ ...next.record, events: [{ ...next.record.events[0], revision: 99 }] }),
    ).toThrow()
    expect(restoreLocal('{').active).toBeNull()
    expect(restoreLocal('{').warning).toBe('corrupt')
  })
})
