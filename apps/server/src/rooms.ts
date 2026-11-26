import { randomInt, randomUUID } from 'node:crypto'
import {
  SEATS,
  applyAction,
  createDeck,
  createMatch,
  getLegalActions,
  getPlayerView,
  validateAction,
  type Card,
  type GameAction,
  type Seat,
} from '../../../packages/game-engine/src'
import { chooseHeuristic } from '../../../packages/bots/src'
import { BotSearch } from './bot-search'
import type {
  Command,
  Presence,
  Request,
  RoomListing,
  ServerEvent,
} from '../../../packages/multiplayer/src/protocol'
import {
  cleanText,
  checkPassword,
  hashPassword,
  isObject,
  passwordMatches,
  requireRoom,
  RoomError,
  takeLimit,
} from './room-guards'
import {
  bot,
  entry,
  human,
  listing,
  randomize,
  resetReady,
  setCapacity,
  settingsFrom,
  snapshot,
  status,
  swap,
  vacant,
  type LiveRoom,
} from './room-model'

type Send = (event: ServerEvent) => void
interface Subscriber {
  send: Send
  directory: boolean
}
interface Visitor {
  id: string
  name: string
  room: LiveRoom | null
  sockets: Set<Subscriber>
  offlineAt: number | null
  seen: Set<string>
  limits: Map<string, number[]>
  pending: Promise<void>
  queued: number
}
export interface RoomOptions {
  maxRooms?: number
  maxConnections?: number
  graceMs?: number
  idleMs?: number
  botMs?: number
  transitionMs?: number
  /** Deterministic engine shuffle for server fixtures. */
  seed?: () => number
  shuffleIndex?: (exclusiveUpperBound: number) => number
}
export class RoomService {
  private rooms = new Map<string, LiveRoom>()
  private guests = new Map<string, Visitor>()
  private listings = new Map<string, RoomListing>()
  private passwordWindows = new Map<string, number[]>()
  private lastPresence = ''
  private serial = 0
  private hashing = 0
  private connections = 0
  private running = true
  private search = new BotSearch()
  private readonly grace: number
  private readonly expiry: number
  private readonly sweepTimer: ReturnType<typeof setInterval>
  constructor(private options: RoomOptions = {}) {
    this.grace = options.graceMs ?? 45_000
    this.expiry = options.idleMs ?? 2 * 60 * 60_000
    this.sweepTimer = setInterval(
      () => this.sweep(),
      Math.max(10, Math.min(5_000, this.grace / 2, this.expiry / 2)),
    )
    this.sweepTimer.unref()
  }

  connect(guestId: string, send: Send) {
    const max = this.options.maxConnections ?? 512
    requireRoom(this.running && this.connections < max, 'capacity')
    let g = this.guests.get(guestId)
    if (g?.offlineAt != null && Date.now() - g.offlineAt >= this.grace) {
      this.sweep()
      g = this.guests.get(guestId)
    }
    if (!g) {
      requireRoom(this.guests.size < max * 4, 'capacity')
      g = {
        id: guestId,
        name: '',
        room: null,
        sockets: new Set(),
        offlineAt: null,
        seen: new Set(),
        limits: new Map(),
        pending: Promise.resolve(),
        queued: 0,
      }
      this.guests.set(guestId, g)
    }
    requireRoom(g.sockets.size < 8, 'capacity')
    const guest = g
    const socket: Subscriber = { send, directory: false }
    const reconnect = guest.offlineAt !== null
    guest.offlineAt = null
    guest.sockets.add(socket)
    this.connections++
    send({ type: 'guest', guest: { id: guest.id, name: guest.name } })
    if (guest.room) {
      const room = guest.room
      const seat = room.seats.find((s) => s.guestId === guest.id)!
      if (reconnect) {
        seat.connected = true
        entry(room, {
          kind: 'system',
          system: 'reconnect',
          name: guest.name,
          text: guest.name + ' reconnected.',
        })
        this.publish(room)
      } else send({ type: 'room', room: snapshot(room) })
      if (room.game) {
        if (!room.timer && reconnect) this.schedule(room)
        this.sendGame(room, guest)
      } else send({ type: 'game', game: null })
    } else {
      send({ type: 'room', room: null })
      send({ type: 'game', game: null })
    }
    this.publishPresence()
    return {
      receive: async (raw: unknown) => {
        if (!this.running || !guest.sockets.has(socket)) return
        let id: string | undefined
        try {
          requireRoom(
            isObject(raw) &&
              typeof raw.type === 'string' &&
              typeof raw.requestId === 'string' &&
              /^[\w.-]{1,80}$/.test(raw.requestId),
            'invalid',
          )
          id = raw.requestId
          takeLimit(guest.limits, 'all', 150, 10_000)
          requireRoom(guest.queued < 8, 'rate_limited')
          requireRoom(!guest.seen.has(id), 'duplicate')
          guest.seen.add(id)
          if (guest.seen.size > 256) guest.seen.delete(guest.seen.values().next().value!)
          // Mutations from the same guest keep arrival order, including an in-flight password check.
          guest.queued++
          const operation = guest.pending.then(() => {
            requireRoom(this.running && guest.sockets.has(socket), 'disconnected')
            return this.command(guest, socket, raw as Request)
          })
          guest.pending = operation
            .catch(() => {})
            .finally(() => {
              guest.queued--
            })
          await operation
          if (guest.sockets.has(socket)) send({ type: 'ack', requestId: id })
        } catch (e) {
          if (guest.sockets.has(socket))
            send({ type: 'error', requestId: id, code: e instanceof RoomError ? e.message : 'invalid' })
        }
      },
      close: () => {
        if (!guest.sockets.delete(socket)) return
        this.connections--
        if (!guest.sockets.size) {
          guest.offlineAt = Date.now()
          const room = guest.room
          if (room) {
            const s = room.seats.find((s) => s.guestId === guest.id)!
            s.connected = false
            s.ready = false
            if (!room.seats.some((h) => h.kind === 'human' && h.connected)) {
              clearTimeout(room.timer)
              room.timer = undefined
              room.deadline = null
              room.botAbort?.abort()
            }
            entry(room, {
              kind: 'system',
              system: 'disconnect',
              name: guest.name,
              text: guest.name + ' disconnected.',
            })
            this.publish(room)
          }
        }
        this.publishPresence()
      },
    }
  }
  dispose() {
    this.running = false
    clearInterval(this.sweepTimer)
    this.search.dispose()
    for (const room of this.rooms.values()) clearTimeout(room.timer)
    this.rooms.clear()
    this.guests.clear()
    this.listings.clear()
    this.passwordWindows.clear()
  }
  private send(g: Visitor, event: ServerEvent) {
    for (const s of g.sockets) s.send(event)
  }
  private broadcast(event: ServerEvent) {
    for (const guest of this.guests.values())
      for (const s of guest.sockets) if (s.directory) s.send(event)
  }
  private presence(): Presence {
    let connected = 0,
      waiting = 0,
      playing = 0,
      browsing = 0
    for (const guest of this.guests.values()) {
      if (!guest.sockets.size) continue
      connected++
      if (!guest.room) {
        if ([...guest.sockets].some((channel) => channel.directory)) browsing++
      } else if (status(guest.room) === 'playing') playing++
      else waiting++
    }
    return {
      connected,
      browsing,
      waiting,
      playing,
      rooms: this.rooms.size,
      matches: [...this.rooms.values()].filter((r) => status(r) === 'playing').length,
    }
  }
  private publishPresence() {
    const presence = this.presence()
    const stamp = JSON.stringify(presence)
    if (stamp !== this.lastPresence) {
      this.lastPresence = stamp
      this.broadcast({ type: 'presence', presence })
    }
  }
  /** Directory, member and owner-specific messages are constructed independently. */
  private publish(room: LiveRoom, bump = true) {
    if (room.closed) return
    room.lastActivity = Date.now()
    if (bump) room.revision = ++this.serial
    const dto = snapshot(room)
    for (const s of room.seats)
      if (s.guestId) {
        const g = this.guests.get(s.guestId)
        if (g) this.send(g, { type: 'room', room: dto })
      }
    const item = listing(room)
    if (JSON.stringify(this.listings.get(room.id)) !== JSON.stringify(item)) {
      this.listings.set(room.id, item)
      this.broadcast({ type: 'directory:upsert', room: item })
    }
    this.publishPresence()
  }
  private sendGame(room: LiveRoom, g: Visitor) {
    const seat = room.seats.find((s) => s.guestId === g.id)
    if (!room.game || !seat || g.room !== room) return
    const view = getPlayerView(room.game, seat.seat)
    this.send(g, {
      type: 'game',
      game: {
        matchId: room.matchId!,
        view,
        legal: getLegalActions(view, seat.seat),
        deadline: room.deadline,
      },
    })
  }
  private games(room: LiveRoom) {
    for (const s of room.seats)
      if (s.guestId && s.connected) this.sendGame(room, this.guests.get(s.guestId)!)
  }
  private async digest<T>(fn: () => Promise<T>) {
    requireRoom(this.hashing < 6, 'rate_limited')
    this.hashing++
    try {
      return await fn()
    } finally {
      this.hashing--
    }
  }
  private available(g: Visitor, s: Subscriber) {
    requireRoom(this.running && g.sockets.has(s), 'disconnected')
    requireRoom(!g.room, 'already_in_room')
    requireRoom(!!g.name, 'name_required')
  }
  private inRoom(g: Visitor) {
    const r = g.room
    requireRoom(r && !r.closed, 'room_missing')
    return r
  }
  private isHost(room: LiveRoom, g: Visitor) {
    requireRoom(room.hostId === g.id, 'forbidden')
  }
  private async command(g: Visitor, s: Subscriber, c: Command) {
    switch (c.type) {
      case 'directory:subscribe':
        s.directory = true
        s.send({
          type: 'directory:snapshot',
          rooms: [...this.listings.values()],
          presence: this.presence(),
        })
        this.publishPresence()
        return
      case 'directory:unsubscribe':
        s.directory = false
        this.publishPresence()
        return
      case 'guest:name': {
        const name = cleanText(c.name, 1, 24)
        requireRoom(!g.room || status(g.room) !== 'playing' || name === g.name, 'match_active')
        if (g.name === name) return
        takeLimit(g.limits, 'name', 10, 60_000)
        g.name = name
        this.send(g, { type: 'guest', guest: { id: g.id, name } })
        if (g.room) {
          g.room.seats.find((seat) => seat.guestId === g.id)!.name = name
          this.publish(g.room)
        }
        return
      }
      case 'room:create': {
        this.available(g, s)
        takeLimit(g.limits, 'create', 4, 60_000)
        const config = settingsFrom(c.settings)
        const cap = this.options.maxRooms ?? 128
        requireRoom(this.rooms.size < cap, 'capacity')
        const password =
          c.password === undefined
            ? null
            : await this.digest(() => hashPassword(checkPassword(c.password)))
        this.available(g, s)
        requireRoom(this.rooms.size < cap, 'capacity')
        const room: LiveRoom = {
          id: randomUUID(),
          hostId: g.id,
          created: Date.now(),
          lastActivity: Date.now(),
          revision: 0,
          settings: config,
          seats: SEATS.map(vacant),
          password,
          chat: [],
          excluded: new Set(),
          game: null,
          matchId: null,
          deadline: null,
          closed: false,
        }
        room.seats[0] = human('south', g.id, g.name)
        setCapacity(room, config.humanCapacity)
        if (config.teams === 'random') randomize(room)
        this.rooms.set(room.id, room)
        g.room = room
        entry(room, { kind: 'system', system: 'join', name: g.name, text: g.name + ' opened the room.' })
        this.publish(room)
        return
      }
      case 'room:join': {
        this.available(g, s)
        takeLimit(g.limits, 'join', 24, 60_000)
        const room = this.rooms.get(c.roomId)
        requireRoom(room, 'room_missing')
        const check = () => {
          this.available(g, s)
          requireRoom(!room.closed, 'room_missing')
          requireRoom(!room.excluded.has(g.id), 'kicked')
          requireRoom(!room.game, 'room_busy')
          requireRoom(
            room.seats.some((seat) => seat.kind === 'empty'),
            'room_full',
          )
        }
        check()
        const password = room.password
        if (password) {
          takeLimit(g.limits, 'password', 5, 60_000)
          takeLimit(this.passwordWindows, room.id, 40, 60_000)
          requireRoom(typeof c.password === 'string' && c.password.length > 0, 'wrong_password')
          const value = checkPassword(c.password)
          requireRoom(await this.digest(() => passwordMatches(value, password)), 'wrong_password')
          check()
          requireRoom(room.password === password, 'stale')
        }
        // No awaits between the final membership/capacity check and assigning the slot.
        const open = room.seats.filter((seat) => seat.kind === 'empty')
        const i = SEATS.indexOf(open[room.settings.teams === 'random' ? randomInt(open.length) : 0].seat)
        room.seats[i] = human(SEATS[i], g.id, g.name)
        g.room = room
        resetReady(room)
        entry(room, { kind: 'system', system: 'join', name: g.name, text: g.name + ' joined the room.' })
        this.publish(room)
        return
      }
      case 'room:leave':
        this.removeMember(this.inRoom(g), g, 'leave')
        return
      case 'game:action':
        this.humanAction(this.inRoom(g), g, c)
        return
      case 'room:chat': {
        const room = this.inRoom(g)
        requireRoom(status(room) !== 'playing', 'room_busy')
        takeLimit(g.limits, 'chat', 6, 10_000)
        const text = cleanText(c.text, 1, 280)
        entry(room, { kind: 'chat', text, guestId: g.id, name: g.name })
        this.publish(room, false)
        return
      }
    }
    const room = this.inRoom(g)
    requireRoom('revision' in c && c.revision === room.revision, 'stale')
    const seat = room.seats.find((v) => v.guestId === g.id)!
    if (c.type === 'room:return') {
      this.isHost(room, g)
      requireRoom(
        room.game && (room.game.phase === 'NEXT_HAND' || room.game.phase === 'MATCH_COMPLETE'),
        'room_busy',
      )
      clearTimeout(room.timer)
      room.game = null
      room.matchId = null
      room.deadline = null
      resetReady(room)
      entry(room, {
        kind: 'system',
        system: 'return',
        name: g.name,
        text: g.name + ' returned the group to the room.',
      })
      for (const h of room.seats)
        if (h.guestId) this.send(this.guests.get(h.guestId)!, { type: 'game', game: null })
      this.publish(room)
      return
    }
    requireRoom(!room.game, 'room_busy')
    if (c.type === 'room:ready') {
      requireRoom(typeof c.ready === 'boolean', 'invalid')
      seat.ready = c.ready
      entry(room, {
        kind: 'system',
        system: 'ready',
        name: g.name,
        ready: c.ready,
        text: g.name + (c.ready ? ' is ready.' : ' is choosing a seat.'),
      })
      this.publish(room)
      return
    }
    if (c.type === 'room:seat') {
      const dst = room.seats.find((v) => v.seat === c.seat)
      requireRoom(dst, 'invalid')
      requireRoom(dst.kind === 'empty', 'seat_occupied')
      swap(room, seat.seat, c.seat)
      resetReady(room)
      entry(room, {
        kind: 'system',
        system: 'move',
        name: g.name,
        seat: c.seat,
        text: g.name + ' moved to ' + c.seat + '.',
      })
      this.publish(room)
      return
    }
    this.isHost(room, g)
    switch (c.type) {
      case 'room:settings': {
        const next = settingsFrom(c.settings)
        const previous = room.settings
        setCapacity(room, next.humanCapacity)
        if (next.teams === 'random' && previous.teams !== 'random') randomize(room)
        if (
          Object.keys(next).some(
            (k) =>
              k !== 'title' &&
              k !== 'description' &&
              previous[k as keyof typeof next] !== next[k as keyof typeof next],
          )
        )
          resetReady(room)
        room.settings = next
        entry(room, {
          kind: 'system',
          system: 'settings',
          name: g.name,
          text: g.name + ' updated the room settings.',
        })
        break
      }
      case 'room:password': {
        takeLimit(g.limits, 'lock', 8, 60_000)
        const digest =
          c.password === '' ? null : await this.digest(() => hashPassword(checkPassword(c.password)))
        requireRoom(
          this.running &&
            g.sockets.has(s) &&
            g.room === room &&
            room.hostId === g.id &&
            !room.game &&
            room.revision === c.revision,
          'stale',
        )
        room.password = digest
        entry(room, {
          kind: 'system',
          system: 'settings',
          name: g.name,
          text: g.name + ' updated room access.',
        })
        break
      }
      case 'room:swap':
        swap(room, c.a, c.b)
        resetReady(room)
        entry(room, {
          kind: 'system',
          system: 'move',
          name: g.name,
          seat: c.a,
          otherSeat: c.b,
          text: g.name + ' swapped ' + c.a + ' and ' + c.b + '.',
        })
        break
      case 'room:randomize':
        randomize(room)
        resetReady(room)
        entry(room, {
          kind: 'system',
          system: 'move',
          name: g.name,
          text: g.name + ' shuffled the teams.',
        })
        break
      case 'room:bot': {
        const idx = SEATS.indexOf(c.seat)
        requireRoom(idx >= 0 && typeof c.enabled === 'boolean', 'invalid')
        const prev = room.seats[idx]
        requireRoom(c.enabled ? prev.kind === 'empty' : prev.kind === 'bot', 'seat_occupied')
        room.seats[idx] = c.enabled ? bot(c.seat) : vacant(c.seat)
        room.settings.humanCapacity = 4 - room.seats.filter((h) => h.kind === 'bot').length
        resetReady(room)
        entry(room, {
          kind: 'system',
          system: 'bot',
          name: g.name,
          seat: c.seat,
          enabled: c.enabled,
          difficulty: room.settings.difficulty,
          text:
            g.name +
            (c.enabled
              ? ' added a ' + room.settings.difficulty + ' bot at '
              : ' opened a human seat at ') +
            c.seat +
            '.',
        })
        break
      }
      case 'room:kick': {
        const target = this.guests.get(c.guestId)
        requireRoom(target && target !== g && target.room === room, 'forbidden')
        if (room.excluded.size >= 128) room.excluded.delete(room.excluded.values().next().value!)
        room.excluded.add(target.id)
        this.send(target, { type: 'error', code: 'kicked' })
        this.removeMember(room, target, 'kick')
        return
      }
      case 'room:start': {
        requireRoom(status(room) === 'ready', 'not_ready')
        room.matchId = randomUUID()
        room.game = createMatch(
          { target: room.settings.target },
          this.options.seed?.() ?? 0,
          this.dealDeck(),
        )
        entry(room, { kind: 'system', system: 'start', name: g.name, text: 'The match has started.' })
        this.schedule(room)
        this.publish(room)
        this.games(room)
        return
      }
      default:
        throw new RoomError('invalid')
    }
    this.publish(room)
  }
  private humanAction(room: LiveRoom, g: Visitor, c: Extract<Command, { type: 'game:action' }>) {
    const game = room.game
    requireRoom(game && c.matchId === room.matchId, 'stale')
    const seat = room.seats.find((h) => h.guestId === g.id)?.seat
    requireRoom(seat, 'forbidden')
    const input = c.action
    requireRoom(isObject(input) && input.revision === game.revision, 'stale')
    let action: GameAction
    if (input.type === 'advance') {
      requireRoom(game.phase === 'NEXT_HAND', 'forbidden')
      action = { type: 'advance', revision: game.revision }
    } else {
      requireRoom(input.seat === seat && game.turn === seat, 'forbidden')
      if (input.type === 'bid') action = { type: 'bid', bid: input.bid, seat, revision: game.revision }
      else {
        requireRoom(input.type === 'play' && isObject(input.card), 'invalid')
        requireRoom(
          input.declarations === undefined ||
            (Array.isArray(input.declarations) &&
              input.declarations.length <= 32 &&
              input.declarations.every((d) => typeof d === 'string' && d.length <= 100)),
          'invalid',
        )
        action = {
          type: 'play',
          seat,
          revision: game.revision,
          card: { suit: input.card.suit, rank: input.card.rank },
          declarations: input.declarations ?? (room.settings.allowHints ? undefined : []),
        }
      }
    }
    requireRoom(validateAction(game, action), 'invalid')
    this.play(room, action)
  }
  private dealDeck(): readonly Card[] | undefined {
    if (this.options.seed) return undefined
    const draw = this.options.shuffleIndex ?? randomInt
    const deck = createDeck()
    for (let i = deck.length - 1; i > 0; i--) {
      const j = draw(i + 1)
      ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
    }
    return deck
  }
  private play(room: LiveRoom, action: GameAction) {
    const before = room.game!
    room.game = applyAction(
      before,
      action,
      before.phase === 'INITIAL_DEAL' ? this.dealDeck() : undefined,
    )
    room.lastActivity = Date.now()
    this.schedule(room)
    if (room.game.phase === 'MATCH_COMPLETE') this.publish(room)
    this.games(room)
  }
  private schedule(room: LiveRoom) {
    clearTimeout(room.timer)
    room.botAbort?.abort()
    room.botAbort = undefined
    room.timer = undefined
    room.deadline = null
    const game = room.game
    if (
      !game ||
      !room.seats.some((s) => s.kind === 'human' && s.connected) ||
      game.phase === 'NEXT_HAND' ||
      game.phase === 'MATCH_COMPLETE'
    )
      return
    const choosing = game.phase === 'BIDDING' || game.phase === 'PLAYING_TRICK'
    const isBot = room.seats.find((s) => s.seat === game.turn)?.kind === 'bot'
    let delay: number
    if (choosing) {
      if (!isBot && !room.settings.turnSeconds) return
      delay = isBot ? (this.options.botMs ?? 850) : room.settings.turnSeconds * 1000
      if (!isBot) room.deadline = Date.now() + delay
    } else
      delay =
        this.options.transitionMs ??
        (game.phase === 'TRICK_RESOLUTION' ? 2350 : game.phase === 'FINAL_DEAL' ? 650 : 230)
    room.timer = setTimeout(async () => {
      if (!this.running || room.closed || room.game !== game) return
      let action: GameAction = { type: 'advance', revision: game.revision }
      if (choosing) {
        const view = getPlayerView(game, game.turn)
        const legal = getLegalActions(view, game.turn)
        // Bots and timed-out humans select from the same seat-limited information as a client.
        if (isBot && room.settings.difficulty === 'advanced') {
          const controller = new AbortController()
          room.botAbort = controller
          const move = await this.search.choose(view, legal, controller.signal)
          if (!move || controller.signal.aborted || !this.running || room.closed || room.game !== game)
            return
          room.botAbort = undefined
          action = move
        } else
          action = chooseHeuristic(view, legal, {
            difficulty: isBot ? room.settings.difficulty : 'beginner',
          }).action
        if (!isBot && action.type === 'play' && !room.settings.allowHints)
          action = { ...action, declarations: [] }
      }
      this.play(room, action)
    }, delay)
    room.timer.unref()
  }
  private hostTo(room: LiveRoom, s: { guestId?: string; name?: string }) {
    if (s.guestId && room.hostId !== s.guestId) {
      room.hostId = s.guestId
      entry(room, { kind: 'system', system: 'host', name: s.name, text: s.name + ' is now the host.' })
    }
  }
  private removeMember(room: LiveRoom, g: Visitor, reason: 'leave' | 'kick') {
    const idx = room.seats.findIndex((s) => s.guestId === g.id)
    if (idx === -1) return
    const replacing = room.game !== null
    const seat = SEATS[idx]
    room.seats[idx] = replacing ? bot(seat) : vacant(seat)
    if (replacing) room.settings.humanCapacity = 4 - room.seats.filter((h) => h.kind === 'bot').length
    g.room = null
    this.send(g, { type: 'room', room: null })
    this.send(g, { type: 'game', game: null })
    entry(room, {
      kind: 'system',
      system: reason,
      name: g.name,
      text: g.name + (reason === 'kick' ? ' was removed.' : ' left the room.'),
    })
    const others = room.seats.filter((h) => h.kind === 'human')
    if (!others.length) {
      this.closeRoom(room)
      return
    }
    if (room.hostId === g.id) this.hostTo(room, others.find((h) => h.connected) ?? others[0])
    if (!room.game) resetReady(room)
    const reschedule = room.game && (room.game.turn === seat || !others.some((h) => h.connected))
    if (reschedule) this.schedule(room)
    this.publish(room)
    if (reschedule) this.games(room)
  }
  private closeRoom(room: LiveRoom) {
    if (room.closed) return
    room.closed = true
    room.botAbort?.abort()
    clearTimeout(room.timer)
    for (const s of room.seats)
      if (s.guestId) {
        const g = this.guests.get(s.guestId)
        if (g?.room === room) {
          g.room = null
          this.send(g, { type: 'error', code: 'room_missing' })
          this.send(g, { type: 'room', room: null })
          this.send(g, { type: 'game', game: null })
        }
      }
    this.rooms.delete(room.id)
    this.listings.delete(room.id)
    this.passwordWindows.delete(room.id)
    this.broadcast({ type: 'directory:remove', roomId: room.id })
    this.publishPresence()
  }
  private sweep() {
    const now = Date.now()
    for (const room of this.rooms.values()) {
      if (now - room.lastActivity >= this.expiry) {
        this.closeRoom(room)
        continue
      }
      const users = room.seats.filter((s) => s.kind === 'human').map((s) => this.guests.get(s.guestId!)!)
      const expired = users.filter((g) => g.offlineAt !== null && now - g.offlineAt >= this.grace)
      if (expired.length === users.length) {
        this.closeRoom(room)
        continue
      }
      for (const g of expired) {
        if (!room.game || room.settings.replaceDisconnected) {
          this.removeMember(room, g, 'leave')
        } else if (room.hostId === g.id) {
          const successor = room.seats.find((s) => s.kind === 'human' && s.connected)
          if (successor) {
            this.hostTo(room, successor)
            this.publish(room)
          }
        }
      }
    }
    for (const g of this.guests.values())
      if (!g.room && g.offlineAt !== null && now - g.offlineAt >= Math.max(60_000, this.grace))
        this.guests.delete(g.id)
  }
}
