import { useCallback, useEffect, useReducer, useRef } from 'react'
import { randomId } from '../randomId'
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
  resumeSeat: boolean
  retrying: boolean
  restoringName: boolean
  guest: Guest | null
  presence: Presence | null
  rooms: RoomListing[]
  room: RoomSnapshot | null
  game: MatchProjection | null
  notice: string | null
}
const initial: ConnectionState = {
  connected: false,
  resumeSeat: false,
  retrying: false,
  restoringName: false,
  guest: null,
  presence: null,
  rooms: [],
  room: null,
  game: null,
  notice: null,
}
type Update =
  | ServerEvent
  | { type: 'disconnected' | 'clearNotice' | 'idle' }
  | { type: 'restoringName'; value: boolean }
function reduce(state: ConnectionState, event: Update): ConnectionState {
  switch (event.type) {
    case 'guest':
      return {
        ...(state.guest && state.guest.id !== event.guest.id
          ? { ...initial, resumeSeat: state.resumeSeat || !!state.room }
          : state),
        guest: event.guest,
      }
    case 'idle':
      return state.notice ? { ...initial, notice: state.notice } : initial
    case 'restoringName':
      return { ...state, restoringName: event.value }
    case 'disconnected':
      return {
        ...state,
        connected: false,
        retrying: true,
        restoringName: false,
        presence: null,
        rooms: [],
      }
    case 'directory:snapshot':
      if (state.room) return state
      return { ...state, rooms: event.rooms, presence: event.presence }
    case 'directory:upsert':
      if (!state.presence || state.room) return state
      return {
        ...state,
        rooms: [...state.rooms.filter((room) => room.id !== event.room.id), event.room],
      }
    case 'directory:remove':
      if (!state.presence || state.room) return state
      return { ...state, rooms: state.rooms.filter((room) => room.id !== event.roomId) }
    case 'presence':
      if (!state.presence || state.room) return state
      return { ...state, presence: event.presence }
    case 'room':
      return {
        ...state,
        connected: true,
        retrying: false,
        // The directory is unsubscribed while seated. A fresh snapshot follows a return.
        rooms: event.room || state.room ? [] : state.rooms,
        presence: event.room || state.room ? null : state.presence,
        resumeSeat: false,
        notice:
          event.room && event.room.id !== state.room?.id
            ? null
            : (state.room || state.resumeSeat) && !state.connected && !event.room
              ? 'seat_expired'
              : state.notice,
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
const seatKey = 'belot.online.occupied-seat'
function initialConnection() {
  try {
    if (location.protocol !== 'file:' && sessionStorage.getItem(seatKey) === '1')
      return { ...initial, resumeSeat: true }
  } catch {
    /* Offline and storage-limited browsers still work without a resume hint. */
  }
  return initial
}
export function useMultiplayer(active: boolean) {
  const [state, dispatch] = useReducer(reduce, undefined, initialConnection)
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
        const id = randomId()
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
  // Browsing another club section keeps an occupied seat connected, including across reconnects.
  const hasSeat = !!state.room
  const shouldConnect = active || hasSeat || state.resumeSeat
  useEffect(() => {
    if (!state.connected) return
    try {
      if (hasSeat) sessionStorage.setItem(seatKey, '1')
      else sessionStorage.removeItem(seatKey)
    } catch {
      /* Only the server decides whether a seat is still reserved. */
    }
  }, [hasSeat, state.connected])
  useEffect(() => {
    if (!shouldConnect) {
      dispatch({ type: 'idle' })
      return
    }
    const cancel = new AbortController()
    let handshake: AbortController | null = null
    let retry = 0,
      attempt = 0,
      welcomeTimeout = 0
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
          handshake = new AbortController()
          const deadline = window.setTimeout(() => handshake?.abort(), 12000)
          try {
            const response = await fetch('/api/multiplayer/session', {
              method: 'POST',
              credentials: 'same-origin',
              signal: handshake.signal,
            })
            if (!response.ok) throw new Error('session')
          } finally {
            clearTimeout(deadline)
            handshake = null
          }
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
        welcomeTimeout = window.setTimeout(() => client.close(), 12000)
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
              () => {
                if (socket.current === client) client.close()
              },
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
              clearTimeout(welcomeTimeout)
              welcomed = true
              attempt = 0
              if (!event.guest.name) {
                const name = rememberedName()
                if (name) {
                  dispatch({ type: 'restoringName', value: true })
                  void send({ type: 'guest:name', name })
                    .catch(() => {})
                    .finally(() => {
                      if (socket.current === client) dispatch({ type: 'restoringName', value: false })
                    })
                }
              }
            }
          }
        }
        client.onerror = () => client.close()
        client.onclose = () => {
          clearTimeout(welcomeTimeout)
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
      handshake?.abort()
      clearTimeout(retry)
      clearTimeout(welcomeTimeout)
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
  }, [send, shouldConnect])
  return { ...state, send, clearNotice: () => dispatch({ type: 'clearNotice' }) }
}
export type Multiplayer = ReturnType<typeof useMultiplayer>
