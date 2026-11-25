// Test an isolated copy so that origin-relative and sibling files cannot silently satisfy a request.
import { expect, chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { observeDeal } from '../tests/e2e/observeDeal.ts'

const artifact = new URL('../dist/Belot-Club.html', import.meta.url)
if (!existsSync(artifact)) throw new Error('Build the standalone edition with pnpm build first')
const executablePath =
  process.env.BELOT_CHROMIUM ??
  (existsSync(chromium.executablePath())
    ? undefined
    : [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ].find(existsSync))
const directory = await mkdtemp(join(tmpdir(), 'belot-portable-'))
const isolated = join(directory, 'Белот Club.html')
let browser
try {
  await copyFile(artifact, isolated)
  const file = pathToFileURL(isolated).href
  browser = await chromium.launch({ executablePath })
  const context = await browser.newContext({ offline: true, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  const problems = []
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    url.hash = ''
    if (url.href !== file) problems.push('External resource: ' + url.href)
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('websocket', (socket) => problems.push('External socket: ' + socket.url()))
  await context.addInitScript(() => {
    if (!localStorage.getItem('belot.club.session')) {
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 3,
          active: null,
          history: [],
          prefs: { lang: 'en', speed: 'fast', difficulty: 'advanced', animationSpeed: 'normal' },
        }),
      )
    }
    // Seed 7 exposes all three court ranks under the usual five-card opening.
    const original = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 7
        return array
      }
      return original(array)
    }
    const WorkerConstructor = window.Worker
    window.Worker = class extends WorkerConstructor {
      constructor(...args) {
        super(...args)
        const protocol = new URL(args[0], location.href).protocol
        this.addEventListener('message', ({ data }) => {
          if (data.reason === 'simulation' && data.samples > 0)
            document.documentElement.dataset.sampledWorker = protocol
        })
      }
    }
  })
  await page.goto(file)
  await page.evaluate(observeDeal)
  await page.getByRole('button', { name: 'Play now', exact: true }).click()
  const layer = page.locator('[data-animation-layer]')
  await expect(page.locator('html')).toHaveAttribute(
    'data-observed-deal',
    JSON.stringify({ stage: 'deal', cards: 20, faces: 5, backs: 20, animated: 20 }),
  )
  await expect(layer).toHaveAttribute('data-choreography', 'idle')

  // Verify the image pixels loaded by the actual DOM against the bundled source files.
  const sources = await page.evaluate(async () => {
    const result = {}
    async function checkImage(name, image) {
      await image.decode()
      if (!image.naturalWidth) throw new Error('Image did not decode: ' + name)
      result[name] = image.src
    }
    for (const [seat, name] of [
      ['north', 'elena'],
      ['east', 'martin'],
      ['west', 'boris'],
    ])
      await checkImage(name, document.querySelector('[data-anim-seat="' + seat + '"] img'))
    for (const [rank, name] of [
      ['J', 'jack'],
      ['Q', 'queen'],
      ['K', 'king'],
    ])
      await checkImage(name, document.querySelector('[data-anim-card$="-' + rank + '"] img'))
    const surface = document.querySelector('.arena-surface')
    const background = getComputedStyle(surface).backgroundImage.match(/url\("([^"]+)"\)/)
    if (!background) throw new Error('Expected an image on the active playing surface')
    const felt = new Image()
    felt.src = background[1]
    await checkImage('emerald-baize', felt)
    await document.fonts.ready
    return result
  })
  for (const [name, source] of Object.entries(sources)) {
    const bytes = await readFile(new URL('../apps/web/public/art/' + name + '.webp', import.meta.url))
    if (source !== 'data:image/webp;base64,' + bytes.toString('base64'))
      throw new Error('Incorrect embedded artwork: ' + name)
  }
  await page.locator('[data-bid="pass"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-sampled-worker', /^(data|blob):$/, {
    timeout: 15000,
  })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')).active)
  expect(saved.events.length).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('[data-animation-table]')).toBeVisible()
  const restored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('belot.club.session')).active,
  )
  expect(restored.id).toBe(saved.id)
  expect(restored.events.slice(0, saved.events.length)).toEqual(saved.events)
  expect(problems).toEqual([])
  console.log(
    'Standalone file verified offline: three portraits, three court ranks, felt, 20 animated deal cards, a sampled worker decision and restored progress.',
  )
} finally {
  await browser?.close()
  if (existsSync(isolated)) await unlink(isolated)
  await rmdir(directory)
}
