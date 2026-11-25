import { expect, test } from './fixture'
import { RULESET } from '../../packages/game-engine/src'
import type { Page } from '@playwright/test'

async function restoreAtOpeningBid(page: Page) {
  await page.addInitScript((ruleset) => {
    if (!localStorage.getItem('belot.club.session'))
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 2,
          prefs: { lang: 'en', motion: true, speed: 'fast' },
          history: [],
          active: {
            version: 1,
            ruleset,
            config: {},
            seed: 57,
            events: [],
            hints: 0,
            assisted: false,
            id: 'tool-test',
            date: '2026-10-01T08:30:00.000Z',
            difficulty: 'beginner',
          },
        }),
      )
  }, RULESET)
  await page.goto('/#table')
  await expect(page.locator('.hand-card')).toHaveCount(5)
}
test('switches live assistance presets without moving the table or altering the deal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await restoreAtOpeningBid(page)
  const cards = await page
    .locator('.hand-card')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')))
  const rect = await page.locator('.hand-cards').boundingBox()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Table tools', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Table tools' })
  await menu.getByRole('button', { name: 'Table settings', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Table settings' })
  await drawer.getByLabel('Assistance mode').selectOption('learning')
  await expect(drawer.getByRole('switch', { name: 'Show card points' })).toBeChecked()
  await drawer.getByRole('switch', { name: 'Automatic coaching' }).check()
  await drawer.getByLabel('Assistance mode').selectOption('expert')
  await expect(drawer.getByRole('switch', { name: 'Show card points' })).toBeDisabled()
  await expect(drawer.getByLabel('Animation speed')).toHaveValue('fast')
  expect(await page.locator('.hand-cards').boundingBox()).toEqual(rect)
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.hand-card')).toHaveCount(5)
  expect(
    await page
      .locator('.hand-card')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))),
  ).toEqual(cards)
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')!))
  expect(save.version).toBe(4)
  expect(save.prefs).toMatchObject({
    assistanceMode: 'expert',
    speed: 'fast',
    points: false,
    autoCoach: false,
  })
  expect(save.active.events).toHaveLength(0)
  await page.getByRole('button', { name: 'Table tools', exact: true }).click()
  await menu.getByRole('button', { name: 'Game rules', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Deal and teams' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('keeps audio silent until an unmute gesture and persists the mixer controls', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext
    window.AudioContext = class extends Native {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args)
        document.documentElement.dataset.audioStarted = 'true'
      }
      createOscillator() {
        document.documentElement.dataset.audioTone = 'true'
        return super.createOscillator()
      }
    }
  })
  await restoreAtOpeningBid(page)
  await expect(page.locator('html')).not.toHaveAttribute('data-audio-started', 'true')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Table settings' })
  await drawer.locator('summary').filter({ hasText: 'Audio' }).click()
  await drawer.getByRole('switch', { name: 'Mute', exact: true }).uncheck()
  await expect(page.locator('html')).toHaveAttribute('data-audio-started', 'true')
  await drawer.getByRole('slider', { name: 'Master volume' }).press('ArrowLeft')
  await drawer.getByRole('slider', { name: 'Effects volume' }).press('ArrowLeft')
  await drawer.getByRole('switch', { name: 'Club ambience' }).check()
  await page.keyboard.press('Escape')
  await page.locator('[data-bid="clubs"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-audio-tone', 'true')
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')!).prefs),
  ).toMatchObject({
    muted: false,
    masterVolume: 64,
    effectsVolume: 69,
    ambient: true,
  })
})
