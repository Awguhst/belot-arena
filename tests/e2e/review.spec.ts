import { expect, test } from './fixture'
import { applyCommand, createMatch, getLegalActions, RULESET } from '../../packages/game-engine/src'
import type { GameAction, GameEvent } from '../../packages/game-engine/src'

/** Replay a real auction and eight tricks. This seed deals South Q-K-A of clubs. */
function completedHand() {
  const seed = 1
  const config = { target: 151 }
  let state = createMatch(config, seed)
  const events: GameEvent[] = []
  while (!state.result) {
    let action: GameAction
    if (state.phase === 'BIDDING') {
      action = {
        type: 'bid',
        seat: state.turn,
        bid: state.bids.length ? 'pass' : 'hearts',
        revision: state.revision,
      }
    } else if (state.phase === 'PLAYING_TRICK') {
      action = getLegalActions(state, state.turn)[0]!
      if (action.type === 'play' && action.seat === 'south' && !state.tricks.length)
        action = { ...action, declarations: [] }
    } else {
      action = { type: 'advance', revision: state.revision }
    }
    const result = applyCommand(state, action)
    state = result.state
    events.push(result.event)
  }
  const record = {
    seed,
    config,
    events,
    version: 1,
    ruleset: RULESET,
    assisted: false,
    hints: 0,
    difficulty: 'intermediate',
    id: 'review-fixture',
    date: '2026-01-05T12:00:00Z',
  }
  return { record, score: state.result }
}
const fixture = completedHand()
test.beforeEach(async ({ page }) => {
  await page.addInitScript((record) => {
    localStorage.setItem(
      'belot.club.session',
      JSON.stringify({ version: 2, prefs: { lang: 'en' }, active: null, history: [record] }),
    )
  }, fixture.record)
})

test('replays a completed hand, compares a legal bid and explains the score', async ({ page }) => {
  await page.goto('/#analysis')
  await expect(page.getByRole('heading', { name: 'Analysis', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous action', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next action', exact: true }).click()
  const comparison = page.getByRole('combobox', { name: 'Compare legal choices' })
  await comparison.selectOption({ label: 'All Trumps' })
  await expect(page.getByText('With this choice · All Trumps', { exact: true })).toBeVisible()
  await expect(page.getByText(/The heuristic uses the player’s own cards/)).toBeVisible()
  await page.getByRole('button', { name: /^Trick 1 / }).click()
  await expect(page.locator('.rv-trick .rv-card')).toHaveCount(4)
  await expect(page.locator('.rv-felt-foot')).toContainText('Winner')
  await page.getByRole('button', { name: 'Last action', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Next action', exact: true })).toBeDisabled()
  await expect(page.getByText('Hand complete', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Original hands' })).toBeVisible()
  await expect(page.locator('.rv-hand .rv-chip')).toHaveCount(32)
  await expect(page.locator('.rv-missed li')).toContainText('Q♣ K♣ A♣')
  const allocation = page.getByRole('row', { name: /^Points awarded/ })
  await expect(allocation.getByRole('cell')).toHaveText([
    String(fixture.score.awarded.us),
    String(fixture.score.awarded.them),
  ])
  await page.getByRole('button', { name: 'First action', exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Replay position' })
  await slider.focus()
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue('1')
})

test('keeps the replay and score accessible on a portrait phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/#analysis')
  await page.getByRole('button', { name: /^Trick 8 / }).click()
  await expect(page.locator('.rv-trick .rv-card')).toHaveCount(4)
  await page.getByRole('heading', { name: 'Score breakdown' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('row', { name: /^Raw points/ })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(360)
})

test('recovers from an empty statistics filter without losing the saved hand', async ({ page }) => {
  await page.goto('/#stats')
  await page.getByRole('button', { name: 'Assisted', exact: true }).click()
  await expect(page.getByText('No completed hands match this filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all results' }).click()
  await expect(page.locator('.stat-history tbody tr')).toHaveCount(1)
})
