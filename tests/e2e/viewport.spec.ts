import type { Locator } from '@playwright/test'
import {
  applyCommand,
  createMatch,
  getLegalActions,
  RULESET,
  type GameEvent,
} from '../../packages/game-engine/src'
import { expect, test } from './fixture'

test.use({ hasTouch: true })

test('keeps the Bulgarian lounge actions and settings fields within a narrow phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/#play')
  const hero = page.locator('.hero')
  await expect(hero.getByRole('button', { name: 'Опции за игра' })).toBeVisible()
  const inside = await hero.evaluate((element) => {
    const card = element.getBoundingClientRect()
    return [...element.querySelectorAll('button')].every((button) => {
      const rect = button.getBoundingClientRect()
      return rect.left >= card.left && rect.right <= card.right && rect.bottom <= card.bottom
    })
  })
  expect(inside).toBe(true)
  await hero.getByRole('button', { name: 'Опции за игра' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Затвори', exact: true }).click()
  await page.goto('/#settings')
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

function firstTrick() {
  const seed = 1
  const config = { dealer: 'south', practiceContract: 'hearts' } as const
  let state = createMatch(config, seed)
  const events: GameEvent[] = []
  for (let i = 0; i < 3; i++) {
    const step = applyCommand(state, getLegalActions(state, state.turn)[0])
    events.push(step.event)
    state = step.state
  }
  return {
    version: 1,
    ruleset: RULESET,
    id: 'viewport',
    date: '2026-01-01T00:00:00Z',
    seed,
    config,
    events,
    difficulty: 'beginner',
    hints: 0,
    assisted: false,
  }
}

async function cardGeometry(cards: Locator, trick = false) {
  return cards.evaluateAll((nodes, trick) => {
    const felt = document.querySelector('.arena-surface')!.getBoundingClientRect()
    const buttons = nodes as HTMLElement[]
    // Trick faces are display-only. Temporarily make their paint order observable by hit testing.
    const pointerEvents = buttons.map((card) => card.style.pointerEvents)
    if (trick)
      buttons.forEach((card) => {
        card.style.pointerEvents = 'auto'
      })
    try {
      return buttons.map((card) => {
        const bounds = card.getBoundingClientRect()
        const index = card.querySelector('.deck-index')!
        const rankRange = document.createRange()
        rankRange.selectNodeContents(index.firstChild!)
        function probe(rect: DOMRect) {
          const x = rect.left + rect.width / 2,
            y = rect.top + rect.height / 2
          const hit = document.elementFromPoint(x, y)
          return {
            x,
            y,
            visible: card.contains(hit),
            covering: hit?.closest('button, [aria-label]')?.getAttribute('aria-label') ?? hit?.className,
          }
        }
        return {
          label: card.getAttribute('aria-label'),
          key: card.dataset.animCard,
          legal: card.dataset.legal === 'true',
          rotation: new DOMMatrixReadOnly(getComputedStyle(card).transform).b,
          // A rotated card's axis-aligned bounding box includes the extremity of each physical corner.
          clearance: Math.min(
            bounds.left - felt.left,
            felt.right - bounds.right,
            bounds.top - felt.top,
            felt.bottom - bounds.bottom,
          ),
          rank: probe(rankRange.getBoundingClientRect()),
          suit: probe(index.querySelector('i')!.getBoundingClientRect()),
        }
      })
    } finally {
      if (trick)
        buttons.forEach((card, i) => {
          card.style.pointerEvents = pointerEvents[i]
        })
    }
  }, trick)
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
]) {
  test(`rotated hand and active trick stay visible and playable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
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
    }, firstTrick())
    await page.goto('/#table')
    const felt = page.locator('.felt')
    const hand = page.locator('.hand-card')
    const trick = page.locator('.arena-trick .trick-card')
    await expect(felt).toHaveAttribute('data-turn', 'south')
    await expect(hand).toHaveCount(8)
    await expect(trick).toHaveCount(3)
    await page.evaluate(() => document.fonts.ready)
    const handMetrics = await cardGeometry(hand)
    const trickMetrics = await cardGeometry(trick, true)
    const canScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
    )
    expect(canScroll).toBe(false)
    for (const card of [...handMetrics, ...trickMetrics]) {
      expect.soft(Math.abs(card.rotation), card.label + ' rotation').toBeGreaterThan(0.01)
      expect.soft(card.clearance, card.label + ' distance to felt edge').toBeGreaterThanOrEqual(-0.5)
      expect.soft(card.rank.visible, card.label + ' rank covered by ' + card.rank.covering).toBe(true)
      expect.soft(card.suit.visible, card.label + ' suit covered by ' + card.suit.covering).toBe(true)
    }
    for (const card of handMetrics) {
      await expect(page.getByRole('button', { name: card.label!, exact: true })).toHaveAttribute(
        'aria-disabled',
        String(!card.legal),
      )
    }
    await page.screenshot({ path: info.outputPath('live-trick.png') })
    // Hold the fourth card at its table position until the geometry and accepted play have been read.
    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
    await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'))
    const playable = handMetrics.find((card) => card.legal)!
    await page.touchscreen.tap(playable.rank.x, playable.rank.y)
    await expect(hand).toHaveCount(7)
    await expect(page.locator('[data-anim-card="' + playable.key + '"]')).toHaveCount(0)
    const fourth = page.locator('.trick-card[data-anim-trick="south"]')
    await expect(fourth).toHaveCount(1)
    const [south] = await cardGeometry(fourth)
    expect(south.clearance, 'fourth trick card distance to felt edge').toBeGreaterThanOrEqual(-0.5)
    const event = await page.evaluate(
      () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events[3].action,
    )
    expect(event.type).toBe('play')
    expect(event.seat).toBe('south')
    expect(event.card.suit + '-' + event.card.rank).toBe(playable.key)
  })
}
