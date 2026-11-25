import { randomInt, randomUUID } from 'node:crypto'
import { RULESET, SEATS, type GameState, type Seat } from '../../../packages/game-engine/src'
import type {
  RoomSettings,
  RoomSeat,
  RoomListing,
  RoomStatus,
  ChatEntry,
  RoomSnapshot,
} from '../../../packages/multiplayer/src/protocol'
import { cleanText, isObject, requireRoom, type PasswordDigest } from './room-guards'

export interface LiveRoom {
  id: string
  hostId: string
  created: number
  lastActivity: number
  revision: number
  settings: RoomSettings
  seats: RoomSeat[]
  password: PasswordDigest | null
  chat: ChatEntry[]
  excluded: Set<string>
  game: GameState | null
  matchId: string | null
  timer?: ReturnType<typeof setTimeout>
  botAbort?: AbortController
  deadline: number | null
  closed: boolean
}

export function settingsFrom(input: unknown): RoomSettings {
  requireRoom(isObject(input), 'invalid')
  const {
    humanCapacity,
    target,
    difficulty,
    ruleset,
    teams,
    turnSeconds,
    allowHints,
    allowEducation,
    replaceDisconnected,
  } = input
  requireRoom(
    typeof humanCapacity === 'number' &&
      Number.isInteger(humanCapacity) &&
      humanCapacity >= 1 &&
      humanCapacity <= 4,
    'invalid',
  )
  requireRoom(target === 51 || target === 101 || target === 151, 'invalid')
  requireRoom(
    difficulty === 'beginner' || difficulty === 'intermediate' || difficulty === 'advanced',
    'invalid',
  )
  requireRoom(ruleset === RULESET && (teams === 'manual' || teams === 'random'), 'invalid')
  requireRoom(
    turnSeconds === 0 ||
      turnSeconds === 15 ||
      turnSeconds === 30 ||
      turnSeconds === 60 ||
      turnSeconds === 120,
    'invalid',
  )
  requireRoom(
    typeof allowHints === 'boolean' &&
      typeof allowEducation === 'boolean' &&
      typeof replaceDisconnected === 'boolean',
    'invalid',
  )
  return {
    title: cleanText(input.title, 1, 64),
    description: cleanText(input.description, 0, 240),
    humanCapacity,
    target,
    difficulty,
    ruleset,
    teams,
    turnSeconds,
    allowHints,
    allowEducation,
    replaceDisconnected,
  }
}
export const vacant = (seat: Seat): RoomSeat => ({ seat, kind: 'empty', connected: false, ready: false })
export const bot = (seat: Seat): RoomSeat => ({ seat, kind: 'bot', connected: false, ready: true })
export const human = (seat: Seat, guestId: string, name: string): RoomSeat => ({
  seat,
  kind: 'human',
  guestId,
  name,
  connected: true,
  ready: false,
})

export function setCapacity(room: LiveRoom, capacity: number) {
  requireRoom(room.seats.filter((s) => s.kind === 'human').length <= capacity, 'capacity')
  const desiredBots = 4 - capacity
  let current = room.seats.filter((s) => s.kind === 'bot').length
  for (let i = 3; i >= 0 && current !== desiredBots; i--) {
    const s = room.seats[i]
    if (current < desiredBots && s.kind === 'empty') {
      room.seats[i] = bot(s.seat)
      current++
    } else if (current > desiredBots && s.kind === 'bot') {
      room.seats[i] = vacant(s.seat)
      current--
    }
  }
}
export function resetReady(room: LiveRoom) {
  for (const s of room.seats) if (s.kind === 'human') s.ready = false
}
export function swap(room: LiveRoom, a: Seat, b: Seat) {
  const ai = SEATS.indexOf(a),
    bi = SEATS.indexOf(b)
  requireRoom(ai !== -1 && bi !== -1 && ai !== bi, 'invalid')
  const first = room.seats[ai]
  room.seats[ai] = { ...room.seats[bi], seat: a }
  room.seats[bi] = { ...first, seat: b }
}
export function randomize(room: LiveRoom) {
  for (let i = 3; i > 0; i--) {
    const j = randomInt(i + 1)
    if (i !== j) swap(room, SEATS[i], SEATS[j])
  }
}
export function status(room: LiveRoom): RoomStatus {
  if (room.closed) return 'closed'
  if (room.game) return room.game.phase === 'MATCH_COMPLETE' ? 'completed' : 'playing'
  return room.seats.every((s) => s.kind === 'bot' || (s.kind === 'human' && s.connected && s.ready))
    ? 'ready'
    : 'waiting'
}
export function listing(room: LiveRoom): RoomListing {
  return {
    id: room.id,
    title: room.settings.title,
    hostName: room.seats.find((s) => s.guestId === room.hostId)?.name ?? '',
    humans: room.seats.filter((s) => s.kind === 'human' && s.connected).length,
    humanCapacity: room.settings.humanCapacity,
    openSeats: room.seats.filter((s) => s.kind === 'empty').length,
    bots: room.seats.filter((s) => s.kind === 'bot').length,
    difficulty: room.settings.difficulty,
    target: room.settings.target,
    locked: !!room.password,
    status: status(room),
    createdAt: room.created,
  }
}
export function snapshot(room: LiveRoom): RoomSnapshot {
  return {
    ...listing(room),
    revision: room.revision,
    hostId: room.hostId,
    settings: { ...room.settings },
    seats: room.seats.map((s) => ({ ...s })),
    chat: room.chat.map((c) => ({ ...c })),
    matchId: room.matchId,
  }
}
export function entry(room: LiveRoom, body: Omit<ChatEntry, 'id' | 'time'>) {
  room.chat.push({ ...body, id: randomUUID(), time: Date.now() })
  if (room.chat.length > 50) room.chat.shift()
}
