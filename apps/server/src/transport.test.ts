import { EventEmitter, once } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it } from 'vitest'
import { attachMultiplayer } from './transport'

it('closes unhandled and refused production upgrades but leaves the Vite HMR socket alone', async () => {
  const standalone = new EventEmitter(),
    development = new EventEmitter()
  attachMultiplayer(standalone, true)
  attachMultiplayer(development)
  try {
    for (const [url, expected] of [
      ['/other', '404'],
      ['/multiplayer/socket', '403'],
    ]) {
      const socket = new PassThrough()
      let reply = ''
      socket.on('data', (part) => {
        reply += part
      })
      const closed = once(socket, 'close')
      standalone.emit('upgrade', { url, headers: {} }, socket, Buffer.alloc(0))
      await closed
      expect(socket.destroyed).toBe(true)
      expect(reply).toContain('HTTP/1.1 ' + expected)
    }
    const hmr = new PassThrough()
    development.emit('upgrade', { url: '/vite-hmr', headers: {} }, hmr, Buffer.alloc(0))
    expect(hmr.writableEnded).toBe(false)
    hmr.destroy()
  } finally {
    standalone.emit('close')
    development.emit('close')
  }
})
