import {
  applyCommand,
  createMatch,
  getLegalActions,
  RULESET,
  type GameEvent,
} from '../../packages/game-engine/src'
import { expect, test } from './fixture'
import { observeDeal } from './observeDeal'
import type { Page } from '@playwright/test'

async function openPractice(page: Page) {
  const record = {
    version: 1,
    ruleset: RULESET,
    id: 'interrupt-test',
    date: '2026-01-01T00:00:00Z',
    seed: 19,
    config: { practiceContract: 'hearts' },
    difficulty: 'intermediate',
    assisted: false,
    hints: 0,
    events: [],
  }
  await page.addInitScript((active) => {
    if (!localStorage.getItem('belot.club.session'))
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 2,
          active,
          history: [],
          prefs: { lang: 'en', speed: 'slow', animationSpeed: 'cinematic', motion: true, undo: true },
        }),
      )
  }, record)
  await page.goto('/#table')
}

test('a played card flies from its lifted face without measuring unrelated opponent hands', async ({
  page,
}) => {
  await openPractice(page)
  const last = page.locator('.hand-card[data-legal="true"]').last()
  await last.hover()
  await last.evaluate(async (card) => {
    const face = card.querySelector<HTMLElement>('.deck-face')!
    await Promise.all(face.getAnimations().map((animation) => animation.finished))
    const rect = Element.prototype.getBoundingClientRect
    const nativeAnimate = Element.prototype.animate
    let expected: DOMRect | undefined,
      lift = 0,
      backReads = 0
    document.addEventListener(
      'click',
      () => {
        const target = rect.call(card)
        expected = rect.call(face)
        lift = target.y + target.height / 2 - expected.y - expected.height / 2
      },
      { capture: true, once: true },
    )
    Element.prototype.getBoundingClientRect = function () {
      if (expected && this.hasAttribute('data-anim-back')) backReads++
      return rect.call(this)
    }
    Element.prototype.animate = function (...args) {
      const animation = nativeAnimate.apply(this, args)
      if (!expected || this.getAttribute('data-flight') !== 'play-south') return animation
      const frame = (animation.effect as KeyframeEffect).getKeyframes()[0]
      const matrix = new DOMMatrixReadOnly(String(frame.transform))
      const node = this as HTMLElement,
        origin = rect.call(node.closest('[data-animation-layer]')!)
      const w = Number.parseFloat(node.style.width),
        h = Number.parseFloat(node.style.height)
      document.documentElement.dataset.liftOff = JSON.stringify({
        lift,
        backReads,
        x: origin.x + matrix.m41 + w / 2 - (expected.x + expected.width / 2),
        y: origin.y + matrix.m42 + h / 2 - (expected.y + expected.height / 2),
        width: w * Math.abs(matrix.a) + h * Math.abs(matrix.c) - expected.width,
      })
      Element.prototype.getBoundingClientRect = rect
      Element.prototype.animate = nativeAnimate
      return animation
    }
  })
  await last.click()
  const receipt = await page.locator('html').getAttribute('data-lift-off')
  expect(receipt).toBeTruthy()
  const result = JSON.parse(receipt!)
  expect(result.lift).toBeGreaterThan(4)
  expect(result.backReads).toBe(0)
  for (const error of [result.x, result.y, result.width]) expect(Math.abs(error)).toBeLessThan(1.25)
})

test('undo cancels an in-flight card and reduced motion releases a subsequent play without replaying it', async ({
  page,
}) => {
  await openPractice(page)
  const layer = page.locator('[data-animation-layer]'),
    hand = page.locator('[data-anim-card]')
  const first = hand.last()
  await first.click()
  await expect(layer).toHaveAttribute('data-choreography', 'play')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(layer).toHaveAttribute('data-choreography', 'idle')
  await expect(hand).toHaveCount(8)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events.length,
    ),
  ).toBe(0)
  await hand.last().click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(layer).toHaveAttribute('data-choreography', 'idle')
  await expect(page.locator('[data-animation-table]')).toHaveAttribute('data-tempo', 'instant')
  await expect(hand).toHaveCount(7)
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('belot.club.session')!).active.events.filter(
          (e: GameEvent) => e.action.type === 'play' && e.action.seat === 'south',
        ).length,
    ),
  ).toBe(1)
})

test('deals in whole packets, reveals just South’s five faces and resumes without repeating the deal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('belot.club.session'))
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 2,
          history: [],
          active: null,
          prefs: { lang: 'en', animationSpeed: 'cinematic', motion: true },
        }),
      )
  })
  await page.goto('/')
  await page.evaluate(observeDeal)
  await page.getByRole('button', { name: 'Play now', exact: true }).click()
  const stage = page.locator('[data-animation-layer]')
  await expect(page.locator('html')).toHaveAttribute(
    'data-observed-deal',
    JSON.stringify({ stage: 'deal', cards: 20, faces: 5, backs: 20, animated: 20 }),
  )
  await page.reload()
  await expect(stage).toHaveAttribute('data-choreography', 'idle')
  await expect(page.locator('[data-anim-card]')).toHaveCount(5)
  await expect(stage.locator('[data-flight]')).toHaveCount(0)
})

test('all four cards travel to the authoritative winner’s pile, and resizing releases the next turn', async ({
  page,
}) => {
  const seed = 401,
    config = { dealer: 'south', practiceContract: 'hearts' } as const
  let s = createMatch(config, seed)
  const events: GameEvent[] = []
  for (let i = 0; i < 3; i++) {
    const { state, event } = applyCommand(s, getLegalActions(s, s.turn)[0])
    events.push(event)
    s = state
  }
  const fourth = getLegalActions(s, 'south')[0]
  if (fourth.type !== 'play') throw Error('Expected a playable card')
  const { state: completed } = applyCommand(s, fourth)
  const fixture = {
    version: 1,
    ruleset: RULESET,
    id: 'choreography-test',
    date: '2026-01-01T00:00:00Z',
    difficulty: 'intermediate',
    hints: 0,
    assisted: false,
    config,
    seed,
    events,
  }
  await page.addInitScript((record) => {
    if (!localStorage.getItem('belot.club.session'))
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 2,
          active: record,
          history: [],
          prefs: { lang: 'en', speed: 'slow', animationSpeed: 'cinematic', motion: true },
        }),
      )
  }, fixture)
  await page.goto('/#table')
  await page.locator('[data-anim-card="' + fourth.card.suit + '-' + fourth.card.rank + '"]').click()
  const layer = page.locator('[data-animation-layer]')
  await expect(layer).toHaveAttribute('data-collecting', 'true')
  const distances = await layer.evaluate((el, winner) => {
    const root = el.closest('[data-animation-table]') ?? document
    const pile = root.querySelector('[data-anim-pile="' + winner + '"]')!.getBoundingClientRect()
    const origin = el.getBoundingClientRect()
    return Array.from(el.querySelectorAll<HTMLElement>('[data-flight^="play-"]')).map((card) => {
      const effect = card.getAnimations()[0]?.effect as KeyframeEffect
      const last = effect.getKeyframes().at(-1)!
      const matrix = new DOMMatrixReadOnly(String(last.transform))
      const x = origin.x + matrix.m41 + card.offsetWidth / 2,
        y = origin.y + matrix.m42 + card.offsetHeight / 2
      return Math.hypot(x - (pile.left + pile.width / 2), y - (pile.top + pile.height / 2))
    })
  }, completed.turn)
  expect(distances).toHaveLength(4)
  expect(distances.every((d) => d < 2)).toBe(true)
  await expect(layer.locator('[data-flight-points]')).toContainText('+')
  await page.setViewportSize({ width: 780, height: 610 })
  await expect(layer).toHaveAttribute('data-collecting', 'false')
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('belot.club.session')!).active.events.filter(
            (e: GameEvent) => e.action.type === 'advance' && e.action.revision === 4,
          ).length,
      ),
    )
    .toBe(1)
})
