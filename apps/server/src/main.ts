import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { attachMultiplayer } from './transport'

const root = resolve(process.env.STATIC_ROOT ?? 'dist')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.md': 'text/plain',
}
const http = createServer((req, res) => {
  api(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      const filename = resolve(root, '.' + (path === '/' ? '/index.html' : path))
      if (!filename.startsWith(root + sep) || !(await stat(filename)).isFile())
        throw new Error('Not found')
      res.writeHead(200, {
        'Content-Type': types[extname(filename)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(filename)
        .on('error', () => res.destroy())
        .pipe(res)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
})
const api = attachMultiplayer(http, true)
const port = Number(process.env.PORT ?? 3000)
http.listen(port, process.env.HOST ?? '0.0.0.0', () =>
  console.log('Belot Club listening on port ' + port),
)
