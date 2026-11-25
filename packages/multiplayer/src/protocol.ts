import type { GameAction, PlayerView, Seat } from '../../game-engine/src'
import type { Difficulty } from '../../bots/src'

export interface RoomSettings {
  title: string
  description: string
  humanCapacity: number
  target: 51 | 101 | 151
  ruleset: 'bulgarian-classic-v1'
  difficulty: Difficulty
  teams: 'manual' | 'random'
  turnSeconds: 0 | 15 | 30 | 60 | 120
  allowHints: boolean
  allowEducation: boolean
  replaceDisconnected: boolean
}
export const defaultRoomSettings: RoomSettings = {
  title: '',
  description: '',
  humanCapacity: 4,
  target: 151,
  ruleset: 'bulgarian-classic-v1',
  difficulty: 'intermediate',
  teams: 'manual',
  turnSeconds: 0,
  allowHints: false,
  allowEducation: false,
  replaceDisconnected: true,
}
export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'completed' | 'closed'
export interface RoomListing {
  id: string
  title: string
  hostName: string
  humans: number
  humanCapacity: number
  bots: number
  openSeats: number
  difficulty: Difficulty
  target: number
  locked: boolean
  status: RoomStatus
  createdAt: number
}
export interface RoomSeat {
  seat: Seat
  kind: 'human' | 'bot' | 'empty'
  guestId?: string
  name?: string
  connected: boolean
  ready: boolean
}
export interface ChatEntry {
  id: string
  time: number
  kind: 'chat' | 'system'
  text: string
  guestId?: string
  name?: string
  system?:
    | 'join'
    | 'leave'
    | 'move'
    | 'ready'
    | 'bot'
    | 'start'
    | 'host'
    | 'settings'
    | 'return'
    | 'kick'
    | 'disconnect'
    | 'reconnect'
  seat?: Seat
  otherSeat?: Seat
  ready?: boolean
  enabled?: boolean
  difficulty?: Difficulty
}
export interface RoomSnapshot extends RoomListing {
  revision: number
  hostId: string
  settings: RoomSettings
  seats: RoomSeat[]
  chat: ChatEntry[]
  matchId: string | null
}
export interface Presence {
  connected: number
  browsing: number
  waiting: number
  playing: number
  rooms: number
  matches: number
}
export interface Guest {
  id: string
  name: string
}
export interface MatchProjection {
  matchId: string
  view: PlayerView
  legal: GameAction[]
  deadline: number | null
}
export type Command =
  | { type: 'directory:subscribe' | 'directory:unsubscribe' | 'room:leave' }
  | { type: 'guest:name'; name: string }
  | { type: 'room:create'; settings: RoomSettings; password?: string }
  | { type: 'room:join'; roomId: string; password?: string }
  | { type: 'room:settings'; settings: RoomSettings; revision: number }
  | { type: 'room:password'; password: string; revision: number }
  | { type: 'room:ready'; ready: boolean; revision: number }
  | { type: 'room:seat'; seat: Seat; revision: number }
  | { type: 'room:swap'; a: Seat; b: Seat; revision: number }
  | { type: 'room:bot'; seat: Seat; enabled: boolean; revision: number }
  | { type: 'room:kick'; guestId: string; revision: number }
  | { type: 'room:randomize' | 'room:start' | 'room:return'; revision: number }
  | { type: 'room:chat'; text: string }
  | { type: 'game:action'; matchId: string; action: GameAction }
export type Request = Command & { requestId: string }
export type ServerEvent =
  | { type: 'guest'; guest: Guest }
  | { type: 'directory:snapshot'; rooms: RoomListing[]; presence: Presence }
  | { type: 'directory:upsert'; room: RoomListing }
  | { type: 'directory:remove'; roomId: string }
  | { type: 'presence'; presence: Presence }
  | { type: 'room'; room: RoomSnapshot | null }
  | { type: 'game'; game: MatchProjection | null }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; requestId?: string; code: string }
