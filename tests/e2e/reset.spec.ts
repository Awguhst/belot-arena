import type { Page } from '@playwright/test'
import { applyCommand, createMatch, getLegalActions, RULESET } from '../../packages/game-engine/src'
import type { MatchRecord } from '../../apps/web/src/session'
import { expect, test } from './fixture'

function matchInProgress(): MatchRecord {
  const config = { target: 101, practiceContract: 'hearts' } as const
  const seed = 21
  const record: MatchRecord = {
    version: 1,
    ruleset: RULESET,
    id: 'active-reset-fixture',
    date: '2026-01-02T12:00:00Z',
    config,
    seed,
    difficulty: 'advanced',
    assisted: true,
    hints: 3,
    events: [],
  }
  let state = createMatch(config, seed)
  while (!(state.handNumber === 2 && state.phase === 'PLAYING_TRICK' && state.turn === 'south')) {
    const action = getLegalActions(state, state.turn)[0] ?? { type: 'advance', revision: state.revision }
    const next = applyCommand(state, action)
    state = next.state
    record.events.push(next.event)
  }
  return record
}

const readSave = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('belot.club.session')!))

test('cancels or resets a scored match with its original configuration and keeps the archive', async ({
  page,
}) => {
  const active = matchInProgress()
  const history = [{ ...active, id: 'previous-match' }]
  const prefs = {
    lang: 'en',
    difficulty: 'beginner',
    target: 51,
    animationSpeed: 'instant',
    muted: true,
    masterVolume: 34,
  }
  await page.addInitScript(
    (save) => {
      if (!localStorage.getItem('belot.club.session'))
        localStorage.setItem('belot.club.session', JSON.stringify(save))
    },
    { version: 3, active, history, prefs },
  )
  await page.goto('/#table')
  const scores = page.locator('.rw-hud-team b')
  const reset = page.getByRole('button', { name: 'Reset game', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Reset this game?' })
  await expect(page.locator('.felt')).toHaveAttribute('data-turn', 'south')
  expect((await scores.allTextContents()).some((value) => Number(value) > 0)).toBe(true)
  await reset.click()
  await expect(dialog).toContainText('0–0')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  expect((await readSave(page)).active).toEqual(active)

  await reset.click()
  await dialog.getByRole('button', { name: 'Reset game', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(scores).toHaveText(['0', '0'])
  await expect(page.locator('.felt')).toHaveAttribute('data-revision', '0')
  await expect(page.locator('.hand-card')).toHaveCount(8)
  const saved = await readSave(page)
  expect(saved.active).toMatchObject({
    config: active.config,
    difficulty: active.difficulty,
    events: [],
    hints: 0,
  })
  expect(saved.active.id).not.toBe(active.id)
  expect(saved.prefs).toMatchObject(prefs)
  await page.reload()
  await expect(page.locator('.felt')).toHaveAttribute('data-revision', '0')
  expect((await readSave(page)).active.id).toBe(saved.active.id)
  await page.goto('/#analysis')
  const archivedHands = page.locator('.rv-heading select option')
  await expect(archivedHands).toHaveCount(2)
  expect(
    await archivedHands.evaluateAll((options) =>
      options.map((option) => option.getAttribute('value')).sort(),
    ),
  ).toEqual([active.id + '/1', history[0].id + '/1'].sort())
})

test('offers a readable reset button on a Bulgarian phone table during the opening deal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/#table')
  const reset = page.getByRole('button', { name: 'Отначало', exact: true })
  await expect(reset.locator('span')).toBeVisible()
  const header = page.locator('.arena-mast')
  expect(await header.evaluate((bar) => bar.scrollWidth <= bar.clientWidth)).toBe(true)
  await reset.click()
  const dialog = page.getByRole('dialog', { name: 'Игра отначало?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(reset).toBeFocused()
  await expect(page.locator('.felt')).toHaveAttribute('data-phase', 'BIDDING')
  await expect(page.locator('.hand-card')).toHaveCount(5)
})
