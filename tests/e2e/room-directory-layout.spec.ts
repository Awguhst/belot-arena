import { expect, test, type Page } from '@playwright/test'

test.skip(process.env.BELOT_OFFLINE_TEST === '1', 'Requires the live room directory.')
test.use({ actionTimeout: 10_000, reducedMotion: 'reduce' })

async function enterDirectory(page: Page, nickname: string) {
  await page.goto('/#online')
  const entry = page.getByRole('region', { name: 'Избери псевдоним' })
  await entry.getByLabel('Псевдоним', { exact: true }).fill(nickname)
  await entry.getByRole('button', { name: 'Към публичните стаи' }).click()
  await expect(page.getByRole('button', { name: 'Създай стая', exact: true })).toBeEnabled()
}

test('keeps long Cyrillic room listings and their Join actions inside the directory at each layout', async ({
  page: host,
  browser,
  baseURL,
}) => {
  const visitor = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const guest = await visitor.newPage()
  const title = 'Щ'.repeat(56) + crypto.randomUUID().slice(0, 8)
  try {
    await Promise.all([enterDirectory(host, 'Щ'.repeat(24)), enterDirectory(guest, 'Мила')])
    await host.getByRole('button', { name: 'Създай стая' }).click()
    const form = host.getByRole('dialog', { name: 'Създай стая' })
    await form.getByLabel('Име на стаята', { exact: true }).fill(title)
    await form.getByLabel('Места за хора', { exact: true }).selectOption('2')
    await form.getByRole('button', { name: 'Създай стая' }).click()

    const row = guest.getByRole('row').filter({ hasText: title })
    const join = row.getByRole('button', { name: 'Влез', exact: true })
    await expect(join).toBeEnabled()
    for (const width of [320, 820, 1440]) {
      await guest.setViewportSize({ width, height: 820 })
      await expect
        .poll(
          () =>
            row.evaluate((element) => {
              const viewport = element.closest('.net-browser')!.getBoundingClientRect()
              return Array.from(element.querySelectorAll('td'))
                .filter((cell) => {
                  const bounds = cell.getBoundingClientRect()
                  const value = cell.firstElementChild!.getBoundingClientRect()
                  return (
                    bounds.left < viewport.left - 1 ||
                    bounds.right > viewport.right + 1 ||
                    value.left < bounds.left - 1 ||
                    value.right > bounds.right + 1
                  )
                })
                .map((cell) => cell.className)
            }),
          { message: 'Room cells and their contents must fit at ' + width + 'px' },
        )
        .toEqual([])
      await join.click({ trial: true })
    }
    await join.click()
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await guest.getByRole('button', { name: 'Напусни стаята' }).click()
    await host.getByRole('button', { name: 'Напусни стаята' }).click()
    await expect(row).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})
