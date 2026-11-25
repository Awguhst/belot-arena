import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { EventEmitter } from 'node:events'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import { RoomService } from './rooms'

function limit(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}
const cookie = 'belot_guest'
const sessionPath = '/api/multiplayer/session'
const socketPath = '/multiplayer/socket'

/** One authority backs HTTP and WebSocket traffic on either Vite or the production listener. */
export function attachMultiplayer(http: EventEmitter, dedicated = false) {
  const maxConnections = limit('MAX_CONNECTIONS', 512, 4, 16000)
  const rooms = new RoomService({
    maxConnections,
    maxRooms: limit('MAX_ROOMS', 100, 1, 4096),
    graceMs: limit('ROOM_GRACE_MS', 60_000, 1000, 600_000),
    idleMs: limit('ROOM_IDLE_MS', 3_600_000, 60_000, 86_400_000),
    botMs: limit('BOT_DELAY_MS', 650, 10, 5000),
    transitionMs: process.env.GAME_TRANSITION_MS
      ? limit('GAME_TRANSITION_MS', 2350, 10, 5000)
      : undefined,
  })
  const ws = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false })
  const key = randomBytes(32)
  const signature = (nonce: string) => createHmac('sha256', key).update(nonce).digest('base64url')
  function identity(req: IncomingMessage) {
    const token = (req.headers.cookie ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookie + '='))
      ?.slice(cookie.length + 1)
    if (!token || !/^[\w-]{32}\.[\w-]{43}$/.test(token)) return null
    const [nonce, mac] = token.split('.')
    if (!timingSafeEqual(Buffer.from(signature(nonce)), Buffer.from(mac))) return null
    return createHash('sha256')
      .update('public-guest/' + nonce)
      .digest('base64url')
      .slice(0, 24)
  }
  function sameOrigin(req: IncomingMessage) {
    try {
      const origin = new URL(req.headers.origin ?? '')
      return (
        /^https?:$/.test(origin.protocol) &&
        origin.origin === req.headers.origin &&
        (process.env.PUBLIC_ORIGIN
          ? origin.origin === process.env.PUBLIC_ORIGIN
          : origin.host === req.headers.host)
      )
    } catch {
      return false
    }
  }
  // Only a trusted, single-hop reverse proxy may supply the peer address.
  function peer(req: IncomingMessage) {
    const forwarded = req.headers['x-forwarded-for']
    return (
      (process.env.TRUST_PROXY === '1' &&
        typeof forwarded === 'string' &&
        forwarded.split(',').at(-1)?.trim()) ||
      req.socket.remoteAddress ||
      'local'
    )
  }
  const windows = new Map<string, { expires: number; count: number }>()
  function allow(key: string, max: number) {
    const now = Date.now()
    let window = windows.get(key)
    if (!window || now >= window.expires) {
      if (!window && windows.size >= 8192) return false
      window = { expires: now + 60_000, count: 0 }
      windows.set(key, window)
    }
    return ++window.count <= max
  }
  function api(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end('{"status":"ok"}')
      return
    }
    if (req.url !== sessionPath) {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST' || !sameOrigin(req)) {
      res.writeHead(403)
      res.end()
      return
    }
    if (!identity(req)) {
      if (!allow('session/' + peer(req), 40)) {
        res.writeHead(429, { 'Retry-After': '60' })
        res.end()
        return
      }
      const nonce = randomBytes(24).toString('base64url')
      const secure = req.headers.origin?.startsWith('https://') ? '; Secure' : ''
      res.setHeader(
        'Set-Cookie',
        cookie +
          '=' +
          nonce +
          '.' +
          signature(nonce) +
          '; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000' +
          secure,
      )
    }
    req.resume()
    res.writeHead(204)
    res.end()
  }
  const alive = new WeakSet<WebSocket>()
  function rejectUpgrade(socket: Duplex, status: string) {
    socket.once('error', () => socket.destroy())
    socket.once('finish', () => socket.destroy())
    socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
  }
  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== socketPath) {
      // Vite has its own HMR upgrade listener. The production service owns every upgrade.
      if (dedicated) rejectUpgrade(socket, '404 Not Found')
      return
    }
    const id = identity(req)
    if (
      req.url !== socketPath ||
      !sameOrigin(req) ||
      !id ||
      ws.clients.size >= maxConnections ||
      !allow('upgrade/' + peer(req), 180)
    ) {
      rejectUpgrade(socket, '403 Forbidden')
      return
    }
    ws.handleUpgrade(req, socket, head, (client) => {
      alive.add(client)
      client.on('pong', () => alive.add(client))
      client.on('error', () => client.terminate())
      let connection: ReturnType<RoomService['connect']>
      try {
        connection = rooms.connect(id, (event) => {
          if (client.readyState !== WebSocket.OPEN) return
          if (client.bufferedAmount > 256 * 1024) {
            client.terminate()
            return
          }
          client.send(JSON.stringify(event))
        })
      } catch {
        client.close(1013, 'Server busy')
        return
      }
      let inflight = 0
      let count = 0
      let since = Date.now()
      client.on('message', (data, binary) => {
        if (client.readyState !== WebSocket.OPEN) return
        if (Date.now() - since >= 1000) {
          since = Date.now()
          count = 0
        }
        if (binary || ++count > 45 || inflight >= 8) {
          client.close(1008, 'Request limit')
          return
        }
        let msg: unknown
        try {
          msg = JSON.parse(data.toString())
        } catch {
          client.close(1007, 'Invalid JSON')
          return
        }
        inflight++
        Promise.resolve(connection.receive(msg))
          .catch(() => client.close(1011, 'Request failed'))
          .finally(() => {
            inflight--
          })
      })
      client.once('close', () => {
        alive.delete(client)
        connection.close()
      })
    })
  }
  http.on('upgrade', upgrade)
  const heartbeat = setInterval(() => {
    const now = Date.now()
    for (const [id, window] of windows) if (now >= window.expires) windows.delete(id)
    for (const client of ws.clients) {
      if (!alive.delete(client)) {
        client.terminate()
        continue
      }
      client.ping()
    }
  }, 30_000)
  heartbeat.unref()
  http.once('close', () => {
    clearInterval(heartbeat)
    http.off('upgrade', upgrade)
    for (const client of ws.clients) client.terminate()
    ws.close()
    rooms.dispose()
  })
  return api
}
