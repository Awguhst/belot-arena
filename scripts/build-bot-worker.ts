import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

/** The development server and production service use the same isolated search worker. */
export async function buildBotWorker() {
  await build({
    entryPoints: [fileURLToPath(new URL('../apps/server/src/bot-worker.ts', import.meta.url))],
    outfile: fileURLToPath(new URL('../.build/bot-worker.cjs', import.meta.url)),
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    bundle: true,
  })
}
