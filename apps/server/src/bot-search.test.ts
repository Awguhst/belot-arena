import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chooseDecision } from '../../../packages/bots/src'
import { createMatch, getLegalActions, getPlayerView } from '../../../packages/game-engine/src'
import { BotSearch } from './bot-search'

let temp: string
let search: BotSearch
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'belot-test-worker-'))
  const file = join(temp, 'bot-worker.cjs')
  await build({
    entryPoints: ['apps/server/src/bot-worker.ts'],
    outfile: file,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  search = new BotSearch(file)
})
afterAll(async () => {
  search?.dispose()
  if (temp) {
    await rm(join(temp, 'bot-worker.cjs'), { force: true })
    await rmdir(temp)
  }
})

it('keeps the server responsive during concurrent advanced decisions and cancels abandoned turns', async () => {
  const state = createMatch({}, 816),
    view = getPlayerView(state, state.turn),
    legal = getLegalActions(view, view.seat)
  const wanted = chooseDecision(view, legal, { difficulty: 'advanced', simulations: 4 }).action
  let beats = 0
  const heartbeat = setInterval(() => {
    beats++
  }, 2)
  try {
    const a = new AbortController(),
      b = new AbortController(),
      c = new AbortController()
    const first = search.choose(view, legal, a.signal),
      second = search.choose(view, legal, b.signal),
      third = search.choose(view, legal, c.signal)
    b.abort()
    c.abort()
    const [actual, cancelled, queued] = await Promise.all([first, second, third])
    expect(actual).toEqual(wanted)
    expect(cancelled).toBeUndefined()
    expect(queued).toBeUndefined()
    expect(beats).toBeGreaterThan(0)
  } finally {
    clearInterval(heartbeat)
  }
})
