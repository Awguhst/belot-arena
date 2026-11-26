import { test, expect, type Page } from '@playwright/test'

test.skip(process.env.BELOT_OFFLINE_TEST === '1', 'These lobby flows use the multiplayer server.')
test.use({ actionTimeout: 10000 })

async function enterClub(page: Page) {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Език', exact: true }).selectOption('en')
}
async function openRoomBrowser(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Online rooms' }).click()
  await expect(page.getByRole('region', { name: 'Choose a nickname' })).toBeVisible()
}
async function nameGuest(page: Page) {
  const form = page.getByRole('region', { name: 'Choose a nickname' })
  await form.getByRole('textbox', { name: 'Nickname', exact: true }).fill('Club guest')
  await form.getByRole('button', { name: 'Enter lobby' }).click()
  await expect(page.getByRole('button', { name: 'Host room', exact: true })).toBeEnabled()
}
async function host(page: Page, title: string) {
  await page.getByRole('button', { name: 'Host room', exact: true }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Room title', { exact: true }).fill(title)
  await form.getByRole('combobox', { name: /^Human seats/ }).selectOption('1')
  await form.getByRole('button', { name: 'Create room', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

async function checkWidth(page: Page, rail: boolean) {
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  const sidebar = page.locator('#club-sidebar')
  const main = await page.getByRole('main').boundingBox()
  expect(main).not.toBeNull()
  if (rail) {
    const bounds = await sidebar.boundingBox()
    expect(bounds).not.toBeNull()
    expect(main!.x).toBeGreaterThanOrEqual(bounds!.x + bounds!.width - 1)
    expect(main!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - bounds!.width - 2)
  } else {
    await expect(sidebar).toBeHidden()
    expect(main!.x).toBe(0)
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeInViewport()
  }
}

test('retains the sidebar, room seat and directory options across club navigation and browser history', async ({
  page,
}, info) => {
  await enterClub(page)
  const navigation = page.getByRole('navigation')
  const rail = await page.locator('#club-sidebar').elementHandle()
  await openRoomBrowser(page)
  await expect(navigation.getByRole('button', { name: 'Online rooms' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await nameGuest(page)
  await page.getByRole('searchbox').fill('Partners')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('No password', { exact: true }).check()
  const title = 'Navigation ' + crypto.randomUUID().slice(0, 8)
  await host(page, title)
  await page.getByRole('button', { name: 'Ready up' }).click()
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled()
  const sockets: string[] = []
  page.on('websocket', (socket) => sockets.push(socket.url()))
  await navigation.getByRole('button', { name: 'Learn', exact: true }).click()
  await expect(navigation.getByRole('button', { name: 'Learn', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('button', { name: 'Return to room', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel ready' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Return to room' }).click()
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled()
  expect(sockets.filter((url) => url.endsWith('/multiplayer/socket'))).toHaveLength(0)
  expect(await rail!.evaluate((el) => el === document.getElementById('club-sidebar'))).toBe(true)
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [820, 820],
    [760, 720],
    [390, 844],
    [320, 640],
  ]) {
    await page.setViewportSize({ width, height })
    await checkWidth(page, width > 760)
    if (width === 1440 || width === 390)
      await page.screenshot({ path: info.outputPath('waiting-' + width + '.png'), fullPage: true })
  }
  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('Partners')
  await expect(page.getByLabel('No password', { exact: true })).toBeChecked()
  await checkWidth(page, false)
})

test('keeps mobile navigation reachable before nickname entry and releases its focus and scroll lock on resize', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await enterClub(page)
  const menu = page.getByRole('button', { name: 'Open menu' })
  await menu.click()
  await openRoomBrowser(page)
  await checkWidth(page, false)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  await expect(drawer.getByRole('button', { name: 'Online rooms' })).toBeFocused()
  await drawer.getByRole('button', { name: 'Settings' }).focus()
  await page.keyboard.press('Tab')
  await expect(drawer.getByRole('button', { name: 'Belot Club' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.click()
  await page.setViewportSize({ width: 820, height: 540 })
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await checkWidth(page, true)
  await nameGuest(page)
  await page.screenshot({ path: info.outputPath('directory-tablet.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 667 })
  await menu.click()
  await page.getByRole('navigation').getByRole('button', { name: 'Statistics' }).click()
  await expect(page.getByRole('heading', { name: 'Statistics', exact: true })).toBeVisible()
  await page.goBack()
  await checkWidth(page, false)
  await expect(page.getByRole('button', { name: 'Host room', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Choose a nickname' })).toHaveCount(0)
})
