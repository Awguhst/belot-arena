import { useCallback, useEffect, useReducer, useRef } from 'react'
import type {
  Command,
  Guest,
  MatchProjection,
  Presence,
  RoomListing,
  RoomSnapshot,
  ServerEvent,
} from '../../../../packages/multiplayer/src/protocol'

interface ConnectionState {
  connected: boolean
  guest: Guest | null
  presence: Presence | null
  rooms: RoomListing[]
  room: RoomSnapshot | null
  game: MatchProjection | null
  notice: string | null
}
const initial: ConnectionState = {
  connected: false,
  guest: null,
  presence: null,
  rooms: [],
  room: null,
  game: null,
  notice: null,
}
type Update = ServerEvent | { type: 'disconnected' | 'clearNotice' }
function reduce(state: ConnectionState, event: Update): ConnectionState {
  switch (event.type) {
    case 'guest':
      return {
        ...(state.guest && state.guest.id !== event.guest.id ? initial : state),
        guest: event.guest,
        connected: true,
      }
    case 'disconnected':
      return { ...state, connected: false, presence: null, rooms: [] }
    case 'directory:snapshot':
      return { ...state, rooms: event.rooms, presence: event.presence }
    case 'directory:upsert':
      return {
        ...state,
        rooms: [...state.rooms.filter((room) => room.id !== event.room.id), event.room],
      }
    case 'directory:remove':
      return { ...state, rooms: state.rooms.filter((room) => room.id !== event.roomId) }
    case 'presence':
      return { ...state, presence: event.presence }
    case 'room':
      return {
        ...state,
        room: event.room,
        game: event.room?.matchId === state.game?.matchId ? state.game : null,
      }
    case 'game':
      return { ...state, game: event.game }
    case 'error':
      return { ...state, notice: event.code }
    case 'clearNotice':
      return { ...state, notice: null }
    default:
      return state
  }
}
function rememberedName() {
  try {
    return localStorage.getItem('belot.multiplayer.name') ?? ''
  } catch {
    return ''
  }
}
function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
export function useMultiplayer() {
  const [state, dispatch] = useReducer(reduce, initial)
  const socket = useRef<WebSocket | null>(null)
  const pending = useRef(
    new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: number }>(),
  )
  const send = useCallback(
    (command: Command) =>
      new Promise<void>((resolve, reject) => {
        const client = socket.current
        if (client?.readyState !== WebSocket.OPEN) {
          reject(new Error('disconnected'))
          return
        }
        const id = requestId()
        const timer = window.setTimeout(() => {
          pending.current.delete(id)
          reject(new Error('timeout'))
        }, 15000)
        pending.current.set(id, { resolve, reject, timer })
        try {
          client.send(JSON.stringify({ ...command, requestId: id }))
        } catch {
          clearTimeout(timer)
          pending.current.delete(id)
          reject(new Error('disconnected'))
        }
      }),
    [],
  )
  useEffect(() => {
    const cancel = new AbortController()
    let retry = 0,
      attempt = 0
    function rejectPending() {
      for (const request of pending.current.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('disconnected'))
      }
      pending.current.clear()
    }
    function reconnect() {
      if (cancel.signal.aborted) return
      dispatch({ type: 'disconnected' })
      clearTimeout(retry)
      retry = window.setTimeout(
        connect,
        Math.min(12000, 350 * 2 ** Math.min(6, attempt++)) + Math.random() * 180,
      )
    }
    async function connect() {
      try {
        // Serialize the first cookie handshake across tabs sharing this browser profile.
        const establish = async () => {
          const response = await fetch('/api/multiplayer/session', {
            method: 'POST',
            credentials: 'same-origin',
            signal: cancel.signal,
          })
          if (!response.ok) throw new Error('session')
        }
        if (navigator.locks)
          await navigator.locks.request('belot.guest.cookie', { signal: cancel.signal }, establish)
        else await establish()
        if (cancel.signal.aborted) return
        const url = new URL('/multiplayer/socket', location.href)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const client = new WebSocket(url)
        socket.current = client
        let welcomed = false
        let subscribed = false
        client.onmessage = ({ data }) => {
          if (cancel.signal.aborted || socket.current !== client) return
          let event: ServerEvent
          try {
            event = JSON.parse(data)
          } catch {
            client.close()
            return
          }
          if (event.type === 'ack' || (event.type === 'error' && event.requestId)) {
            const id = event.requestId!
            const request = pending.current.get(id)
            if (request) {
              clearTimeout(request.timer)
              pending.current.delete(id)
              if (event.type === 'ack') request.resolve()
              else request.reject(new Error(event.code))
            }
            return
          }
          dispatch(event)
          if (event.type === 'room' && subscribed !== !event.room) {
            subscribed = !event.room
            void send({ type: subscribed ? 'directory:subscribe' : 'directory:unsubscribe' }).catch(
              () => {},
            )
          }
          if (event.type === 'guest') {
            if (event.guest.name) {
              try {
                localStorage.setItem('belot.multiplayer.name', event.guest.name)
              } catch {
                /* Guest can still play. */
              }
            }
            if (!welcomed) {
              welcomed = true
              attempt = 0
              if (!event.guest.name) {
                const name = rememberedName()
                if (name) void send({ type: 'guest:name', name }).catch(() => {})
              }
            }
          }
        }
        client.onerror = () => client.close()
        client.onclose = () => {
          if (socket.current === client) {
            socket.current = null
            rejectPending()
            reconnect()
          }
        }
      } catch {
        reconnect()
      }
    }
    void connect()
    return () => {
      cancel.abort()
      clearTimeout(retry)
      const client = socket.current
      socket.current = null
      if (client) {
        client.onmessage = null
        client.onclose = null
        client.onerror = null
        client.close()
      }
      rejectPending()
    }
  }, [send])
  return { ...state, send, clearNotice: () => dispatch({ type: 'clearNotice' }) }
}
