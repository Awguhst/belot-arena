import { RULESET } from '../../packages/game-engine/src'
import { expect, test } from './fixture'

for (const speed of ['normal', 'fast'] as const) {
  test(`a ${speed} bot plays after both its thinking interval and the current card flight`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ speed, ruleset }) => {
        localStorage.setItem(
          'belot.club.session',
          JSON.stringify({
            version: 3,
            history: [],
            prefs: { lang: 'en', speed, animationSpeed: 'cinematic' },
            active: {
              version: 1,
              ruleset,
              seed: 19,
              config: { practiceContract: 'hearts' },
              id: 'pace',
              date: '2026-01-01T00:00:00.000Z',
              difficulty: 'intermediate',
              hints: 0,
              assisted: true,
              events: [],
            },
          }),
        )
      },
      { speed, ruleset: RULESET },
    )
    await page.goto('/#table')
    const table = page.locator('.felt')
    await expect(table).toHaveAttribute('data-turn', 'south')
    await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') })
    await page.clock.pauseAt(new Date('2026-01-01T11:00:00Z'))
    await page.locator('.hand-card[data-legal=true]').first().press('Enter')
    await expect(table).toHaveAttribute('data-revision', '1')
    await expect(page.locator('[data-animation-layer]')).toHaveAttribute('data-choreography', 'play')
    // Cinematic play takes 434ms; Normal thinking takes 650ms and Fast takes 50ms.
    await page.clock.runFor(speed === 'normal' ? 600 : 400)
    await expect(table).toHaveAttribute('data-revision', '1')
    await page.clock.runFor(speed === 'normal' ? 90 : 40)
    // React may commit the unlock after runFor returns. Let its queued dispatch timer run.
    await expect(page.locator('.felt:is([data-interactive=true], [data-revision="2"])')).toHaveCount(1)
    await page.clock.runFor(10)
    await expect(table).toHaveAttribute('data-revision', '2')
  })
}
