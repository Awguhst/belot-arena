import { expect, test } from './fixture'
import type { Page } from '@playwright/test'

/** Only the match's Uint32 shuffle seed is fixed. All moves use the live controls. */
async function openClub(page: Page, seed: number) {
  await page.addInitScript((fixtureSeed) => {
    const original = crypto.getRandomValues.bind(crypto)
    Object.defineProperty(crypto, 'getRandomValues', {
      value: (array: ArrayBufferView<ArrayBuffer>) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = fixtureSeed
          return array
        }
        return original(array)
      },
    })
  }, seed)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Игрална зала' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Език', exact: true }).selectOption('en')
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
}

async function fastTable(page: Page, seed = 447, advanced = false) {
  await openClub(page, seed)
  await navigate(page, 'Settings')
  await page.getByRole('combobox', { name: 'Bot speed' }).selectOption('fast')
  await page.getByRole('combobox', { name: 'Play to' }).selectOption('51')
  if (advanced) await page.getByRole('combobox', { name: 'Bot difficulty' }).selectOption('advanced')
  await page.getByRole('switch', { name: 'Table animations' }).uncheck()
  await navigate(page, 'Play')
  await page.getByRole('button', { name: 'Play now', exact: true }).click()
  await expect(page.locator('.felt')).toHaveAttribute('data-phase', 'BIDDING')
}

/** Stop only at a stable human decision or a closed hand. */
async function nextDecision(page: Page): Promise<string> {
  const ready = page.locator(
    [
      '.felt[data-turn="south"][data-phase="BIDDING"][data-interactive="true"]',
      '.felt[data-turn="south"][data-phase="PLAYING_TRICK"][data-interactive="true"]',
      '.felt[data-phase="NEXT_HAND"]',
      '.felt[data-phase="MATCH_COMPLETE"]',
    ].join(','),
  )
  await ready.waitFor()
  return (await ready.getAttribute('data-phase'))!
}

async function bid(page: Page) {
  const highest = page.locator('[data-bid="all-trumps"][aria-disabled="false"]')
  if (await highest.count()) await highest.click()
  else await page.locator('[data-bid="pass"]').click()
}

async function play(page: Page, touch = false) {
  const card = page.locator('.hand-card[data-legal="true"]').first()
  await expect(card).toBeEnabled()
  // Target the printed rank on the rotated card, just as a player taps the exposed fan.
  const rank = card.locator('.deck-index').first()
  if (touch) await rank.tap()
  else await rank.click()
}

async function position(page: Page) {
  return {
    ownHand: await page
      .locator('.hand-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label'))),
    trick: await page
      .locator('.trick-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label'))),
    scoreboard: await page.locator('.scoreboard').innerText(),
    savedLength: await page.evaluate(
      () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events.length as number,
    ),
  }
}

test('finishes a 51-point match through bidding, scoring, review and local statistics', async ({
  page,
}) => {
  test.setTimeout(150000)
  await fastTable(page)
  let closed = 0,
    cards = 0
  for (let decision = 0; decision < 220; decision++) {
    const phase = await nextDecision(page)
    if (phase === 'MATCH_COMPLETE') break
    if (phase === 'NEXT_HAND') {
      await expect(page.getByRole('button', { name: 'Review hand', exact: true })).toBeVisible()
      closed++
      await page.getByRole('button', { name: 'Next hand', exact: true }).click()
    } else if (phase === 'BIDDING') await bid(page)
    else {
      await play(page)
      cards++
    }
  }
  await expect(page.locator('.felt')).toHaveAttribute('data-phase', 'MATCH_COMPLETE')
  expect(closed).toBeGreaterThan(0)
  expect(cards).toBe((closed + 1) * 8)
  const scores = await page.locator('.scoreboard b').allTextContents()
  expect(Math.max(...scores.map(Number))).toBeGreaterThanOrEqual(51)
  await page.getByRole('button', { name: 'Review match', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Analysis', exact: true })).toBeVisible()
  await navigate(page, 'Statistics')
  await expect(
    page.locator('.stat-metric', { hasText: 'Completed matches' }).locator('strong'),
  ).toHaveText('1')
  await expect(page.locator('.stat-metric', { hasText: 'Hands played' }).locator('strong')).toHaveText(
    String(closed + 1),
  )
})

test('restores a partial trick and undoes the human card together with subsequent bot moves', async ({
  page,
}) => {
  await fastTable(page, 771)
  await bid(page)
  let before: Awaited<ReturnType<typeof position>> | undefined
  for (let i = 0; i < 8; i++) {
    expect(await nextDecision(page)).toBe('PLAYING_TRICK')
    const current = await position(page)
    if (current.trick.length && current.ownHand.length > 1) {
      before = current
      break
    }
    await play(page)
  }
  expect(before).toBeDefined()
  await page.reload()
  expect(await nextDecision(page)).toBe('PLAYING_TRICK')
  expect(await position(page)).toEqual(before)
  await play(page)
  expect(await nextDecision(page)).toBe('PLAYING_TRICK')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await nextDecision(page)).toBe('PLAYING_TRICK')
  expect(await position(page)).toEqual(before)
})

test('the advanced browser worker returns a sampled bidding decision', async ({ page }) => {
  await page.addInitScript(() => {
    const WorkerConstructor = window.Worker
    class ObservedWorker extends WorkerConstructor {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args)
        this.addEventListener('message', (event) => {
          if (event.data.reason === 'simulation')
            document.documentElement.dataset.testAdvancedSamples = String(event.data.samples)
        })
      }
    }
    window.Worker = ObservedWorker
  })
  await fastTable(page, 731, true)
  await bid(page)
  await expect(page.locator('html')).toHaveAttribute('data-test-advanced-samples', /^(?:[1-9]\d*)$/, {
    timeout: 15000,
  })
  while ((await nextDecision(page)) === 'BIDDING') await page.locator('[data-bid="pass"]').click()
  expect(await nextDecision(page)).toBe('PLAYING_TRICK')
})

test('starts contract practice, requests fair coaching and submits a manual declaration', async ({
  page,
}) => {
  await openClub(page, 1)
  await navigate(page, 'Settings')
  await page.getByRole('switch', { name: 'Announce declarations automatically' }).uncheck()
  await navigate(page, 'Play')
  await page.locator('.shortcut.practice').click()
  const options = page.getByRole('dialog')
  await options.getByRole('combobox', { name: 'Contract', exact: true }).selectOption('hearts')
  await options.getByRole('button', { name: 'Start game', exact: true }).click()
  expect(await nextDecision(page)).toBe('PLAYING_TRICK')
  const announcement = page.locator('.declaration-picker input').first()
  await announcement.check()
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await expect(page.locator('.hint-result')).toContainText('Suggested move')
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(announcement).toBeChecked()
  await play(page)
  const record = await page.evaluate(
    () => JSON.parse(localStorage.getItem('belot.club.session')!).active,
  )
  expect(record.hints).toBe(1)
  expect(record.assisted).toBe(true)
  expect(record.events[0].action.declarations.length).toBeGreaterThan(0)
})

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('bids and plays a touch-only trick with a readable hand', async ({ page }) => {
    await fastTable(page, 551)
    const opening = page.locator('.hand-card')
    await expect(opening).toHaveCount(5)
    await page.locator('[data-bid="all-trumps"]').tap()
    expect(await nextDecision(page)).toBe('PLAYING_TRICK')
    await expect(opening).toHaveCount(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const boxes = await opening.evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: rect.left, right: rect.right, height: rect.height }
      }),
    )
    expect(boxes.every((rect) => rect.left >= 0 && rect.right <= 391 && rect.height >= 44)).toBe(true)
    await play(page, true)
    expect(await nextDecision(page)).toBe('PLAYING_TRICK')
    await expect(opening).toHaveCount(7)
  })
})
