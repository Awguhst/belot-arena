import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEATS, createDeck, type GameAction } from '../../../packages/game-engine/src'
import {
  defaultRoomSettings,
  type Command,
  type RoomSettings,
  type ServerEvent,
} from '../../../packages/multiplayer/src/protocol'
import { RoomService } from './rooms'
import { hashPassword, passwordMatches } from './room-guards'

let service: RoomService
let sequence = 0
function peer(id: string) {
  const events: ServerEvent[] = []
  const socket = service.connect(id, (message) => events.push(message))
  function last<K extends ServerEvent['type']>(type: K) {
    return events.findLast((e) => e.type === type) as Extract<ServerEvent, { type: K }>
  }
  return {
    id,
    events,
    close: socket.close,
    send: async (c: Command, requestId = 'r' + ++sequence) => {
      await socket.receive({ ...c, requestId })
      const result = events.findLast(
        (e) => (e.type === 'ack' || e.type === 'error') && e.requestId === requestId,
      )
      return result?.type === 'error' ? result.code : result?.type
    },
    last,
    room: () => last('room').room!,
    game: () => last('game').game!,
  }
}
type Peer = ReturnType<typeof peer>
async function named(id: string, name = id) {
  const p = peer(id)
  await p.send({ type: 'guest:name', name })
  return p
}
async function make(host: Peer, capacity = 2, password?: string, overrides: Partial<RoomSettings> = {}) {
  return host.send({
    type: 'room:create',
    settings: {
      ...defaultRoomSettings,
      title: 'Friendly Belot',
      humanCapacity: capacity,
      target: 51,
      ...overrides,
    },
    password,
  })
}
async function join(p: Peer, host: Peer, password?: string) {
  return p.send({ type: 'room:join', roomId: host.room().id, password })
}
async function ready(p: Peer) {
  return p.send({ type: 'room:ready', ready: true, revision: p.room().revision })
}
async function start(host: Peer) {
  return host.send({ type: 'room:start', revision: host.room().revision })
}
async function activeGroup(count: number, options: Partial<RoomSettings> = {}) {
  const people: Peer[] = []
  for (let i = 0; i < count; i++) people.push(await named('g' + i, 'Player ' + i))
  expect(await make(people[0], count, undefined, options)).toBe('ack')
  for (const p of people.slice(1)) expect(await join(p, people[0])).toBe('ack')
  for (const p of people) expect(await ready(p)).toBe('ack')
  expect(await start(people[0])).toBe('ack')
  return people
}
beforeEach(() => {
  vi.useFakeTimers()
  service = new RoomService({
    graceMs: 50,
    idleMs: 300_000,
    botMs: 10,
    transitionMs: 1,
    seed: () => 137,
  })
})
afterEach(() => {
  service.dispose()
  vi.useRealTimers()
})

describe('public directory and guests', () => {
  it('enforces service limits and expires an idle room while its guest can continue browsing', async () => {
    service.dispose()
    service = new RoomService({ maxRooms: 1, maxConnections: 3, graceMs: 50, idleMs: 100 })
    const a = await named('a'),
      b = await named('b'),
      watch = await named('c')
    await watch.send({ type: 'directory:subscribe' })
    expect(() => peer('fourth')).toThrow('capacity')
    await make(a)
    expect(await make(b)).toBe('capacity')
    expect(await a.send({ type: 'guest:name', name: 'New name' })).toBe('ack')
    expect(watch.last('directory:upsert').room.hostName).toBe('New name')
    const roomId = a.room().id
    await vi.advanceTimersByTimeAsync(125)
    expect(watch.last('directory:remove').roomId).toBe(roomId)
    expect(a.room()).toBe(null)
    expect(a.last('error').code).toBe('room_missing')
    expect(await make(b)).toBe('ack')
  })
  it('counts sessions across tabs and sends incremental listings, reservations and removals', async () => {
    const a = await named('a', 'Alex'),
      b = await named('b', 'Alex'),
      other = peer('a')
    await b.send({ type: 'directory:subscribe' })
    expect(b.last('directory:snapshot')).toMatchObject({
      rooms: [],
      presence: { connected: 2, rooms: 0, browsing: 1 },
    })
    await make(a)
    expect(b.last('directory:upsert').room).toMatchObject({
      hostName: 'Alex',
      humans: 1,
      bots: 2,
      openSeats: 1,
      status: 'waiting',
    })
    await join(b, a)
    expect(
      b
        .room()
        .seats.filter((s) => s.name === 'Alex')
        .map((s) => s.guestId),
    ).toEqual(['a', 'b'])
    expect(b.last('directory:upsert').room.humans).toBe(2)
    expect(b.last('presence').presence).toMatchObject({ connected: 2, waiting: 2, browsing: 0 })
    a.close()
    expect(b.room().seats.find((s) => s.guestId === 'a')?.connected).toBe(true)
    await other.send({ type: 'room:leave' })
    expect(b.room().hostId).toBe('b')
    await b.send({ type: 'room:leave' })
    expect(b.last('directory:remove').roomId).toBe(b.last('directory:upsert').room.id)
    expect(b.last('presence').presence.rooms).toBe(0)
    expect(b.events.filter((e) => e.type === 'directory:snapshot')).toHaveLength(1)
  })
  it('rejects malformed settings, unregistered entries and repeated request IDs', async () => {
    const a = peer('a')
    expect(await make(a)).toBe('name_required')
    await a.send({ type: 'guest:name', name: 'May' })
    for (const change of [
      { title: ' ' },
      { description: 'a'.repeat(241) },
      { humanCapacity: 1.5 },
      { target: 99 },
      { turnSeconds: -1 },
    ]) {
      const c = {
        type: 'room:create',
        settings: { ...defaultRoomSettings, title: 'Test', ...change },
      } as Command
      expect(['invalid', 'rate_limited']).toContain(await a.send(c))
    }
    const b = await named('b')
    expect(await b.send({ type: 'directory:subscribe' }, 'duplicate')).toBe('ack')
    expect(await b.send({ type: 'directory:subscribe' }, 'duplicate')).toBe('duplicate')
    await make(b)
    expect(await make(b)).toBe('already_in_room')
  })
  it('keeps concurrent rooms and their room-only chat isolated', async () => {
    const a = await named('a'),
      b = await named('b'),
      watch = await named('c')
    await watch.send({ type: 'directory:subscribe' })
    await make(a)
    await make(b, 1)
    await a.send({ type: 'room:chat', text: 'Only the first room should see this.' })
    expect(a.room().chat.at(-1)?.kind).toBe('chat')
    expect(JSON.stringify(b.events)).not.toContain('Only the first')
    expect(JSON.stringify(watch.events)).not.toContain('Only the first')
    expect(watch.events.filter((e) => e.type === 'directory:upsert')).toHaveLength(2)
  })
})

describe('room access', () => {
  it('uses distinct salts, checks locks privately, and atomically awards the last reserved seat', async () => {
    const secret = 'private-courts'
    const [one, two] = await Promise.all([hashPassword(secret), hashPassword(secret)])
    expect(one.digest.equals(two.digest)).toBe(false)
    expect(await passwordMatches(secret, one)).toBe(true)
    const host = await named('a'),
      b = await named('b'),
      c = await named('c')
    await c.send({ type: 'directory:subscribe' })
    await make(host, 2, secret)
    expect(c.last('directory:upsert').room.locked).toBe(true)
    expect(await join(b, host, 'incorrect')).toBe('wrong_password')
    const results = await Promise.all([join(b, host, secret), join(c, host, secret)])
    expect(results.sort()).toEqual(['ack', 'room_full'])
    expect(host.room().humans).toBe(2)
    expect(JSON.stringify([...host.events, ...b.events, ...c.events])).not.toContain(secret)
    expect(JSON.stringify(host.events)).not.toMatch(/"digest"|"salt"/)
  })
  it('orders a join and a subsequent leave from two tabs sharing the guest', async () => {
    const host = await named('host'),
      b = await named('guest'),
      other = peer('guest')
    await make(host, 2, 'key')
    expect(await Promise.all([join(b, host, 'key'), other.send({ type: 'room:leave' })])).toEqual([
      'ack',
      'ack',
    ])
    expect(host.room().humans).toBe(1)
    expect(b.room()).toBe(null)
    expect(other.room()).toBe(null)
  })
  it('throttles rejected passwords; permits changing and removing protection only by the host', async () => {
    const a = await named('a'),
      b = await named('b'),
      c = await named('c')
    await make(a, 3, 'old')
    for (let i = 0; i < 5; i++) expect(await join(b, a, 'bad')).toBe('wrong_password')
    expect(await join(b, a, 'old')).toBe('rate_limited')
    await join(c, a, 'old')
    expect(await c.send({ type: 'room:password', password: 'x', revision: c.room().revision })).toBe(
      'forbidden',
    )
    await a.send({ type: 'room:password', password: 'fresh', revision: a.room().revision })
    await vi.advanceTimersByTimeAsync(60_001)
    expect(await join(b, a, 'old')).toBe('wrong_password')
    expect(await a.send({ type: 'room:password', password: '', revision: a.room().revision })).toBe(
      'ack',
    )
    expect(await join(b, a)).toBe('ack')
  })
  it('bounds chat and refuses attempts to hijack seats or enter a room after being removed', async () => {
    const a = await named('a'),
      b = await named('b')
    await make(a, 3)
    await join(b, a)
    expect(await b.send({ type: 'room:swap', a: 'east', b: 'south', revision: b.room().revision })).toBe(
      'forbidden',
    )
    expect(await b.send({ type: 'room:seat', seat: 'south', revision: b.room().revision })).toBe(
      'seat_occupied',
    )
    expect(await b.send({ type: 'room:chat', text: 'A'.repeat(281) })).toBe('invalid')
    for (let i = 0; i < 5; i++) expect(await b.send({ type: 'room:chat', text: 'hi' })).toBe('ack')
    expect(await b.send({ type: 'room:chat', text: 'again' })).toBe('rate_limited')
    expect(await a.send({ type: 'room:kick', guestId: b.id, revision: a.room().revision })).toBe('ack')
    expect(b.room()).toBe(null)
    expect(await join(b, a)).toBe('kicked')
  })
})

describe('waiting seats and availability', () => {
  it.each([1, 2, 3, 4])('reserves exactly %i human seats', async (capacity) => {
    const a = await named('a')
    await make(a, capacity)
    expect(a.room().seats).toHaveLength(4)
    expect(a.room()).toMatchObject({
      humans: 1,
      humanCapacity: capacity,
      bots: 4 - capacity,
      openSeats: capacity - 1,
    })
    expect(await start(a)).toBe('not_ready')
  })
  it('rearranges partners, rejects stale changes and clears readiness on meaningful changes', async () => {
    const a = await named('a'),
      b = await named('b')
    await make(a)
    await join(b, a)
    await ready(a)
    const prior = a.room().revision
    await ready(b)
    expect(a.room().status).toBe('ready')
    expect(await a.send({ type: 'room:swap', a: 'east', b: 'north', revision: prior })).toBe('stale')
    expect(await a.send({ type: 'room:swap', a: 'east', b: 'north', revision: a.room().revision })).toBe(
      'ack',
    )
    expect(b.room().seats.find((s) => s.guestId === 'b')?.seat).toBe('north')
    expect(
      b
        .room()
        .seats.filter((s) => s.kind === 'human')
        .every((s) => !s.ready),
    ).toBe(true)
    await a.send({ type: 'room:bot', seat: 'west', enabled: false, revision: a.room().revision })
    expect(a.room().humanCapacity).toBe(3)
    await b.send({ type: 'room:seat', seat: 'west', revision: b.room().revision })
    await a.send({ type: 'room:bot', seat: 'north', enabled: true, revision: a.room().revision })
    expect(a.room().humanCapacity).toBe(2)
    expect(
      await a.send({
        type: 'room:settings',
        settings: { ...a.room().settings, humanCapacity: 1 },
        revision: a.room().revision,
      }),
    ).toBe('capacity')
    expect(await a.send({ type: 'room:randomize', revision: a.room().revision })).toBe('ack')
    expect(a.room().seats.filter((s) => s.kind === 'bot')).toHaveLength(2)
  })
  it('reconnects inside grace, migrates the host and closes an abandoned room', async () => {
    const a = await named('a'),
      b = await named('b'),
      c = await named('c')
    await c.send({ type: 'directory:subscribe' })
    await make(a)
    await join(b, a)
    a.close()
    expect(c.last('directory:upsert').room).toMatchObject({ humans: 1, openSeats: 0 })
    const back = peer('a')
    expect(back.room().hostId).toBe('a')
    back.close()
    await vi.advanceTimersByTimeAsync(100)
    expect(b.room().hostId).toBe('b')
    expect(b.room().openSeats).toBe(1)
    b.close()
    await vi.advanceTimersByTimeAsync(100)
    expect(c.last('presence').presence.rooms).toBe(0)
    expect(peer('a').room()).toBe(null)
  })
})

describe('server-owned game', () => {
  it('shuffles independently on each initial deal and finishes the hand from its private stock', async () => {
    service.dispose()
    const shuffleIndex = vi.fn((bound: number) => bound - 1)
    service = new RoomService({ shuffleIndex, transitionMs: 1 })
    const people = await activeGroup(4)
    const [south, east] = people
    const ordered = createDeck()
    const bounds = Array.from({ length: 31 }, (_, i) => [32 - i])
    expect(shuffleIndex.mock.calls).toEqual(bounds)
    expect(south.game().view.hand).toEqual([...ordered.slice(0, 3), ...ordered.slice(12, 14)])

    async function bid(bid: 'pass' | 'all-trumps') {
      const { view, matchId } = south.game()
      const player = people[SEATS.indexOf(view.turn)]
      expect(
        await player.send({
          type: 'game:action',
          matchId,
          action: { type: 'bid', bid, seat: view.turn, revision: view.revision },
        }),
      ).toBe('ack')
    }

    for (let i = 0; i < 4; i++) await bid('pass')
    expect(south.game().view.phase).toBe('NEXT_HAND')
    shuffleIndex.mockImplementation(() => 0)
    await south.send({
      type: 'game:action',
      matchId: south.game().matchId,
      action: { type: 'advance', revision: south.game().view.revision },
    })
    await vi.advanceTimersByTimeAsync(1)
    // Swapping each position with zero rotates the ordered deck left by one.
    const second = [...ordered.slice(1), ordered[0]!]
    const five = [...second.slice(0, 3), ...second.slice(12, 14)]
    expect(shuffleIndex.mock.calls).toEqual([...bounds, ...bounds])
    expect(east.game().view.handNumber).toBe(2)
    expect(east.game().view.hand).toEqual(five)
    await bid('all-trumps')
    for (let i = 0; i < 3; i++) await bid('pass')
    await vi.advanceTimersByTimeAsync(1)
    expect(east.game().view.hand).toEqual([...five, ...second.slice(20, 23)])
    expect(shuffleIndex).toHaveBeenCalledTimes(62)
    for (const player of people) {
      expect(JSON.stringify(player.events)).not.toMatch(/"seed"|"stock"|"deck"|"hands"|"originalHands"/)
    }
  })
  it('publishes a different seat projection to each player, enforces turns and keeps outsiders out', async () => {
    const [a, b, c, d] = await activeGroup(4)
    const watcher = await named('z')
    await watcher.send({ type: 'directory:subscribe' })
    expect(watcher.last('directory:snapshot').rooms[0].status).toBe('playing')
    const views = [a, b, c, d].map((p) => p.game().view)
    expect(views.map((v) => v.seat)).toEqual(SEATS)
    expect(new Set(views.flatMap((v) => v.hand.map((card) => card.rank + card.suit))).size).toBe(20)
    expect(JSON.stringify([...a.events, ...watcher.events])).not.toMatch(
      /"seed"|"stock"|"hands"|"originalHands"/,
    )
    expect(watcher.game()).toBe(null)
    expect(await join(watcher, a)).toBe('room_busy')
    const action = a.game().legal[0],
      matchId = a.game().matchId
    expect(await b.send({ type: 'game:action', action, matchId })).toBe('forbidden')
    expect(
      await a.send({ type: 'game:action', action: { type: 'advance', revision: 0 }, matchId }),
    ).toBe('forbidden')
    expect(await a.send({ type: 'game:action', action, matchId })).toBe('ack')
    expect(await a.send({ type: 'game:action', action, matchId })).toBe('stale')
    expect(await a.send({ type: 'room:chat', text: 'team secret' })).toBe('room_busy')
    expect(await a.send({ type: 'guest:name', name: 'New' })).toBe('match_active')
  })
  it('advances timed turns and substitutes disconnected players only when enabled', async () => {
    const [a, b] = await activeGroup(2, { turnSeconds: 15 })
    expect(a.game().deadline).toBe(Date.now() + 15_000)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(a.game().view.revision).toBe(1)
    a.close()
    await vi.advanceTimersByTimeAsync(100)
    expect(b.room().hostId).toBe(b.id)
    expect(b.room().seats.find((s) => s.seat === 'south')?.kind).toBe('bot')
    expect(peer('g0').room()).toBe(null)
  })
  it('preserves a disconnected seat when replacement is disabled', async () => {
    const [a, b] = await activeGroup(2, { replaceDisconnected: false })
    a.close()
    await vi.advanceTimersByTimeAsync(100)
    expect(b.room().hostId).toBe(b.id)
    const back = peer('g0')
    expect(back.game().view.seat).toBe('south')
    expect(back.game().view.revision).toBe(0)
  })
  it('records matching scoring results, keeps the group together after victory and starts a fresh rematch', async () => {
    const people = await activeGroup(4)
    const a = people[0],
      oldMatch = a.game().matchId
    let hands = 0
    for (let n = 0; n < 600; n++) {
      const { view } = a.game()
      if (view.result) {
        hands++
        for (const p of people) expect(p.game().view.result).toEqual(view.result)
      }
      if (view.phase === 'MATCH_COMPLETE') break
      if (view.phase === 'NEXT_HAND') {
        await a.send({
          type: 'game:action',
          matchId: oldMatch,
          action: { type: 'advance', revision: view.revision },
        })
      } else if (view.phase === 'PLAYING_TRICK' || view.phase === 'BIDDING') {
        const p = people[SEATS.indexOf(view.turn)],
          legal = p.game().legal
        const action: GameAction =
          legal.find((s) => s.type === 'bid' && s.bid === 'all-trumps') ?? legal[0]
        expect(await p.send({ type: 'game:action', matchId: oldMatch, action })).toBe('ack')
      }
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(hands).toBeGreaterThan(0)
    expect(a.room().status).toBe('completed')
    expect(a.game().view.winner).toBeTruthy()
    for (const p of people) expect(p.game().view.scores).toEqual(a.game().view.scores)
    await a.send({ type: 'room:return', revision: a.room().revision })
    expect(a.game()).toBe(null)
    expect(a.room().status).toBe('waiting')
    for (const p of people) await ready(p)
    expect(await start(a)).toBe('ack')
    expect(a.game().matchId).not.toBe(oldMatch)
    expect(a.game().view.scores).toEqual({ us: 0, them: 0 })
  })
})
