import type { Page } from '@playwright/test'
import {
  applyCommand,
  createMatch,
  getLegalActions,
  RULESET,
  type GameEvent,
} from '../../packages/game-engine/src'
import { expect, test } from './fixture'

async function startFromLobby(page: Page) {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Език', exact: true }).selectOption('en')
  await page.getByRole('button', { name: 'Play now', exact: true }).click()
  await expect(page.locator('.felt')).toHaveAttribute('data-interactive', 'true')
  await expect(page.locator('.hand-card')).toHaveCount(5)
}

function currentMatchId(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')!).active.id as string)
}

function visibleHand(page: Page) {
  return page
    .locator('.hand-card')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
}

test('enters native fullscreen, exits to the lounge, and resumes the same table', async ({ page }) => {
  await startFromLobby(page)
  const originalId = await currentMatchId(page)
  const hand = await visibleHand(page)
  const toggle = page.getByRole('button', { name: 'Fullscreen', exact: true })
  const inFullscreen = () => page.evaluate(() => document.fullscreenElement === document.documentElement)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await toggle.click()
  await expect.poll(inFullscreen).toBe(true)
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await expect.poll(inFullscreen).toBe(false)
  await toggle.click()
  await expect.poll(inFullscreen).toBe(true)
  await page.getByRole('button', { name: 'Game lounge', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Game lounge', exact: true })).toBeVisible()
  await expect.poll(inFullscreen).toBe(false)
  await expect(page.getByRole('navigation')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Resume game', exact: true }).click()
  await expect(page.locator('.felt')).toHaveAttribute('data-phase', 'BIDDING')
  expect(await currentMatchId(page)).toBe(originalId)
  expect(await visibleHand(page)).toEqual(hand)
})

test('cancels a restart and then deals a fresh practice match from the live table', async ({ page }) => {
  await startFromLobby(page)
  const originalId = await currentMatchId(page)
  await page.locator('[data-bid="all-trumps"]').click()
  const tools = page.getByRole('button', { name: 'Table tools', exact: true })
  const dialog = page.getByRole('dialog')
  async function openMatchSetup() {
    await tools.click()
    await dialog.getByRole('button', { name: 'New game', exact: true }).click()
    await expect(dialog).toContainText('Starting a game replaces your current match')
  }
  await openMatchSetup()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await currentMatchId(page)).toBe(originalId)
  await openMatchSetup()
  await dialog.getByRole('combobox', { name: 'Contract', exact: true }).selectOption('hearts')
  await dialog.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.felt')).toHaveAttribute('data-phase', 'PLAYING_TRICK')
  await expect(page.locator('.hand-card')).toHaveCount(8)
  const replacementId = await currentMatchId(page)
  expect(replacementId).not.toBe(originalId)
  await page.reload()
  await expect(page.locator('.felt')).toHaveAttribute('data-turn', 'south')
  await expect(page.locator('.felt')).toHaveAttribute('data-revision', '0')
  await expect(page.locator('.hand-card')).toHaveCount(8)
  expect(await currentMatchId(page)).toBe(replacementId)
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')!))
  expect(save.active.config.practiceContract).toBe('hearts')
  expect(save.active.events).toEqual([])
  expect(save.history).toContainEqual(expect.objectContaining({ id: originalId }))
})

test('backgrounding an active collection cancels its flight and scores the trick once', async ({
  page,
  context,
}, testInfo) => {
  const seed = 1
  const config = { dealer: 'south', practiceContract: 'hearts' } as const
  let match = createMatch(config, seed)
  const events: GameEvent[] = []
  for (let i = 0; i < 3; i++) {
    const next = applyCommand(match, getLegalActions(match, match.turn)[0])
    events.push(next.event)
    match = next.state
  }
  // South wins the 12-point trick with the ten of clubs and leads next.
  const active = {
    version: 1,
    ruleset: RULESET,
    id: 'visibility-collection',
    date: '2026-01-01T00:00:00Z',
    seed,
    config,
    events,
    difficulty: 'beginner',
    hints: 0,
    assisted: false,
  }
  await page.addInitScript((active) => {
    localStorage.setItem(
      'belot.club.session',
      JSON.stringify({
        version: 3,
        history: [],
        active,
        prefs: { lang: 'en', motion: true, animationSpeed: 'cinematic' },
      }),
    )
  }, active)
  const otherTab = await context.newPage()
  await page.bringToFront()
  await page.goto('/#table')
  const layer = page.locator('[data-animation-layer]')
  const clockStart = new Date('2026-01-01T10:00:00Z')
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(new Date('2026-01-01T11:00:00Z'))
  await page.locator('[data-anim-card="clubs-10"]').press('Enter')
  await expect(layer).toHaveAttribute('data-collecting', 'true')
  await expect(layer.locator('[data-flight^="play-"]')).toHaveCount(4)
  await otherTab.bringToFront()
  const simulated = await page.evaluate(() => {
    if (document.hidden) return false
    // Headless Chromium leaves every tab visible when switching between them.
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    return true
  })
  testInfo.annotations.push({
    type: 'visibility',
    description: simulated ? 'Headless visibilitychange fallback' : 'Native tab switch',
  })
  // The cinematic timeline remains paused. Only visibilitychange can cancel this flight.
  await expect(layer).toHaveAttribute('data-choreography', 'idle')
  await expect(layer.locator('[data-flight]')).toHaveCount(0)
  await page.clock.runFor(40)
  await page.bringToFront()
  if (simulated)
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden')
      Reflect.deleteProperty(document, 'visibilityState')
      document.dispatchEvent(new Event('visibilitychange'))
    })
  await expect(page.locator('.felt')).toHaveAttribute('data-revision', '5')
  await expect(page.locator('.felt')).toHaveAttribute('data-turn', 'south')
  await page.clock.fastForward(10_000)
  await expect(page.locator('[data-points-target="us"]')).toHaveText('12')
  await expect(page.locator('[data-points-target="them"]')).toHaveText('0')
  await expect(page.locator('.south-pile .captured-pile b')).toHaveText('1')
  await page.locator('.hand-card[data-legal="true"]').first().press('Enter')
  await expect(page.locator('.felt')).toHaveAttribute('data-revision', '6')
  const saved: GameEvent[] = await page.evaluate(
    () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events,
  )
  expect(saved.slice(3).map(({ action }) => [action.revision, action.type])).toEqual([
    [3, 'play'],
    [4, 'advance'],
    [5, 'play'],
  ])
  await expect(page.locator('[data-points-target="us"]')).toHaveText('12')
  await expect(page.locator('.south-pile .captured-pile b')).toHaveText('1')
})
