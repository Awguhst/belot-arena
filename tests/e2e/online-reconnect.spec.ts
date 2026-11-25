import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

type SocketProbe = Window & { clubTestSocket?: WebSocket }

async function enter(page: Page, name: string) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('belot.club.session'))
      localStorage.setItem(
        'belot.club.session',
        JSON.stringify({
          version: 4,
          active: null,
          history: [],
          prefs: {
            lang: 'en',
            animationSpeed: 'instant',
            motion: false,
            assistanceMode: 'learning',
            autoCoach: true,
            highlights: true,
            points: true,
          },
        }),
      )
    const Native = window.WebSocket
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        if (new URL(url, location.href).pathname === '/multiplayer/socket')
          (window as SocketProbe).clubTestSocket = this
      }
    }
  })
  await page.goto('/#online')
  const prompt = page.getByRole('dialog')
  await prompt.getByRole('textbox', { name: 'Nickname', exact: true }).fill(name)
  await prompt.getByRole('button', { name: 'Enter lobby' }).click()
  await expect(page.getByRole('button', { name: 'Host room' })).toBeEnabled()
}

async function disconnect(page: Page) {
  await page.context().setOffline(true)
  // Dropping the real socket ensures Chromium also releases its existing upgraded connection.
  await page.evaluate(() => (window as SocketProbe).clubTestSocket!.close())
}

test('recovers missed directory changes and resumes the same private seat with room assistance rules', async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(process.env.BELOT_OFFLINE_TEST === '1', 'Requires the running multiplayer service')
  const second = await browser.newContext({ baseURL })
  const visitor = await second.newPage()
  const title = 'Connection table ' + crypto.randomUUID().slice(0, 8)
  try {
    await Promise.all([enter(page, 'Host Elena'), enter(visitor, 'Guest Boris')])
    await disconnect(visitor)
    await expect(visitor.getByRole('button', { name: 'Host room' })).toBeDisabled()
    await page.getByRole('button', { name: 'Host room' }).click()
    const host = page.getByRole('dialog')
    await host.getByLabel('Room title').fill(title)
    await host.getByLabel('Human seats').selectOption('2')
    await host.getByText('Game options', { exact: true }).click()
    await host.getByLabel('Basic educational assistance').check()
    await expect(host.getByLabel('Strategic hints')).not.toBeChecked()
    await host.getByRole('button', { name: 'Create room' }).click()
    await expect(page.getByRole('button', { name: 'Ready up' })).toBeVisible()
    await second.setOffline(false)
    const listing = visitor.locator('tr[data-room-id]').filter({ hasText: title })
    await listing.getByRole('button', { name: 'Join', exact: true }).click()
    await visitor.getByRole('button', { name: 'Ready up' }).click()
    await expect(page.locator('.net-seat').filter({ hasText: 'Guest Boris' })).toContainText('Ready')
    await page.getByRole('button', { name: 'Ready up' }).click()
    await page.getByRole('button', { name: 'Start match' }).click()
    const table = visitor.locator('.online-table')
    await expect(table.locator('.station.pos-south')).toContainText('Guest Boris')
    await expect(table.locator('.station-name').filter({ hasText: 'Host Elena' })).toHaveCount(1)
    await expect(table.getByRole('button', { name: 'Hint', exact: true })).toHaveCount(0)
    await table.getByRole('button', { name: 'Table tools' }).click()
    const tools = visitor.getByRole('dialog')
    await expect(tools.getByRole('button', { name: 'Game rules' })).toBeVisible()
    await expect(tools.getByRole('button', { name: 'AI coach' })).toHaveCount(0)
    await expect(tools.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await tools.getByRole('button', { name: 'Close', exact: true }).click()
    const saved = {
      seat: await table.getAttribute('data-own-seat'),
      id: await table.getAttribute('data-room-id'),
      hand: await table
        .locator('.hand-card')
        .evaluateAll((cards) => cards.map((el) => el.getAttribute('data-anim-card'))),
    }
    expect(saved.hand).toHaveLength(5)
    await disconnect(visitor)
    await expect(table.getByRole('status').filter({ hasText: 'Reconnecting' })).toBeVisible()
    await expect(page.locator('.station').filter({ hasText: 'Guest Boris' })).toContainText(
      'Disconnected',
    )
    await second.setOffline(false)
    await expect(table.getByRole('status').filter({ hasText: 'Reconnecting' })).toHaveCount(0)
    await expect(page.locator('.station').filter({ hasText: 'Guest Boris' })).not.toContainText(
      'Disconnected',
    )
    await expect(table).toHaveAttribute('data-own-seat', saved.seat!)
    await expect(table).toHaveAttribute('data-room-id', saved.id!)
    expect(
      await table
        .locator('.hand-card')
        .evaluateAll((cards) => cards.map((el) => el.getAttribute('data-anim-card'))),
    ).toEqual(saved.hand)
    await visitor.screenshot({ path: info.outputPath('restored-online-table.png') })
    await visitor.setViewportSize({ width: 390, height: 844 })
    await expect(table.locator('.hand-card').first()).toBeInViewport()
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await visitor.screenshot({ path: info.outputPath('restored-online-table-mobile.png') })
    await table.getByRole('button', { name: 'Leave room', exact: true }).click()
    await visitor.getByRole('dialog').getByRole('button', { name: 'Leave match', exact: true }).click()
    await expect(visitor.getByRole('button', { name: 'Host room' })).toBeEnabled()
    await page.getByRole('button', { name: 'Leave room', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Leave match', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Host room' })).toBeEnabled()
  } finally {
    await second.close()
  }
})
