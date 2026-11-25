import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { buildBotWorker } from './build-bot-worker.ts'

await buildBotWorker()
await build({
  entryPoints: ['apps/server/src/main.ts'],
  outfile: '.build/server.cjs',
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  bundle: true,
  external: ['bufferutil', 'utf-8-validate'],
})
const wsPackage = createRequire(import.meta.url).resolve('ws/package.json')
await copyFile(join(dirname(wsPackage), 'LICENSE'), '.build/ws-LICENSE.txt')
