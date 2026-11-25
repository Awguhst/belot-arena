import { expect, test } from './fixture'
import {
  applyCommand,
  createMatch,
  getLegalActions,
  RULESET,
  type GameEvent,
} from '../../packages/game-engine/src'
import type { MatchRecord } from '../../apps/web/src/session'

function scoringFixture() {
  const seed = 7,
    config = { practiceContract: 'no-trumps' as const, target: 151 }
  let state = createMatch(config, seed)
  const events: GameEvent[] = []
  while (state.phase !== 'HAND_SCORING') {
    const choice = getLegalActions(state, state.turn)[0] ?? { type: 'advance', revision: state.revision }
    const step = applyCommand(state, choice)
    state = step.state
    events.push(step.event)
  }
  const { state: final } = applyCommand(state, { type: 'advance', revision: state.revision })
  const record: MatchRecord = {
    id: 'reward-fixture',
    date: '2026-01-05T12:00:00Z',
    version: 1,
    ruleset: RULESET,
    seed,
    config,
    events,
    assisted: true,
    hints: 0,
    difficulty: 'intermediate',
  }
  return { record, result: final.result!, scores: final.scores }
}
test('skips the score reveal, inspects the component amounts and resumes the scored hand once', async ({
  page,
}) => {
  const { record, result, scores } = scoringFixture()
  await page.addInitScript((record) => {
    const key = 'belot.club.session'
    if (!localStorage.getItem(key))
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 3,
          active: record,
          history: [],
          prefs: { lang: 'en', animationSpeed: 'cinematic', motion: true, speed: 'fast' },
        }),
      )
  }, record)
  await page.goto('/#table')
  await page.getByRole('button', { name: 'Skip count' }).click()
  const summary = page.locator('.rw-result')
  await expect(summary.getByRole('row', { name: /No Trumps doubling/ }).getByRole('cell')).toHaveText([
    String(result.noTrumpBonus.us),
    String(result.noTrumpBonus.them),
  ])
  await expect(summary.getByRole('row', { name: /Match points awarded/ }).getByRole('cell')).toHaveText([
    String(result.awarded.us),
    String(result.awarded.them),
  ])
  await expect(page.locator('.scoreboard b')).toHaveText([String(scores.us), String(scores.them)])
  const revision = await page.evaluate(
    () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events.length,
  )
  await page.screenshot({ path: test.info().outputPath('desktop-score-sheet.png') })
  await page.setViewportSize({ width: 390, height: 720 })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Next hand', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip count' })).toHaveCount(0)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('belot.club.session')!).active.events.length,
    ),
  ).toBe(revision)
  await expect(page.locator('.scoreboard b')).toHaveText([String(scores.us), String(scores.them)])
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('portrait-score-sheet.png') })
})
