import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import type { MatchProjection, RoomSnapshot, ServerEvent } from '../../packages/multiplayer/src/protocol'

test.skip(
  process.env.BELOT_OFFLINE_TEST === '1',
  'Multiplayer uses the live same-origin WebSocket service.',
)
test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 10000 })
interface Player {
  page: Page
  context: BrowserContext
  game: MatchProjection | null
  room: RoomSnapshot | null
  messages: ServerEvent[]
}
async function enter(browser: Browser, baseURL: string, name: string): Promise<Player> {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const player: Player = { context, page, game: null, room: null, messages: [] }
  page.on('websocket', (socket) => {
    if (!socket.url().endsWith('/multiplayer/socket')) return
    socket.on('framereceived', ({ payload }) => {
      const event: ServerEvent = JSON.parse(payload.toString())
      player.messages.push(event)
      if (event.type === 'game') player.game = event.game
      if (event.type === 'room') player.room = event.room
    })
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Език', exact: true }).selectOption('en')
  await page.getByRole('navigation').getByRole('button', { name: 'Online rooms', exact: true }).click()
  const nickname = page.getByRole('region', { name: 'Choose a nickname' })
  await nickname.getByRole('textbox', { name: 'Nickname', exact: true }).fill(name)
  await nickname.getByRole('button', { name: 'Enter lobby', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Host room', exact: true })).toBeEnabled()
  return player
}
async function playHand(players: Player[]) {
  let previous = -1
  for (let moves = 0; moves < 52; moves++) {
    await expect
      .poll(
        () =>
          players.some(
            (p) =>
              p.game &&
              p.game.view.revision > previous &&
              (['MATCH_COMPLETE', 'NEXT_HAND'].includes(p.game.view.phase) ||
                p.game.legal.some((a) => a.type === 'play' || a.type === 'bid')),
          ),
        { timeout: 20000, intervals: [15, 35, 90] },
      )
      .toBe(true)
    const host = players[0].game!
    if (host.view.result && ['MATCH_COMPLETE', 'NEXT_HAND'].includes(host.view.phase)) break
    const actor = players.find(
      (p) => p.game && p.game.view.revision > previous && p.game.legal.some((a) => a.type !== 'advance'),
    )
    if (!actor) continue
    const { view, legal } = actor.game!
    previous = view.revision
    if (view.phase === 'BIDDING') {
      const bid = legal.some((a) => a.type === 'bid' && a.bid === 'all-trumps') ? 'all-trumps' : 'pass'
      await actor.page.locator('[data-bid="' + bid + '"][aria-disabled="false"]').click()
    } else {
      await actor.page.locator('.hand-card[data-legal=true] .deck-index').first().click()
    }
  }
  await Promise.all(
    players.map((p) => expect(p.page.locator('.rw-result-totals')).toBeVisible({ timeout: 20000 })),
  )
  const first = players[0].game!.view
  expect(first.tricks).toHaveLength(8)
  expect(first.result).toBeTruthy()
  for (const p of players) {
    expect(p.game!.view.scores).toEqual(first.scores)
    await expect(p.page.locator('.rw-result-totals [data-room-team="1"] strong')).toHaveText(
      String(first.scores.us),
    )
    await expect(p.page.locator('.rw-result-totals [data-room-team="2"] strong')).toHaveText(
      String(first.scores.them),
    )
    expect(p.game!.view.result).toEqual(first.result)
    expect(p.game!.view.handNumber).toBe(first.handNumber)
    for (const event of p.messages) {
      if (event.type === 'game' && event.game) {
        expect(Object.keys(event.game.view)).not.toEqual(expect.arrayContaining(['hands']))
        expect(event.game.view).not.toHaveProperty('stock')
        expect(event.game.view).not.toHaveProperty('seed')
      }
    }
  }
}
for (const scenario of [
  { title: 'Friendly Belot', humans: 2, locked: false },
  { title: 'Private partners', humans: 2, locked: true },
  { title: 'Four at the table', humans: 4, locked: false },
]) {
  test(
    scenario.title + ' appears live, plays a hand and starts a fresh match',
    async ({ browser, baseURL }, info) => {
      test.setTimeout(210000)
      const players: Player[] = []
      let observer: Player | undefined
      try {
        for (let i = 0; i < scenario.humans; i++)
          players.push(await enter(browser, baseURL!, 'Guest ' + (i + 1)))
        const host = players[0]
        expect((await host.context.cookies()).find((c) => c.name === 'belot_guest')?.httpOnly).toBe(true)
        await host.page.getByRole('button', { name: 'Host room', exact: true }).click()
        const form = host.page.getByRole('dialog')
        await form.getByLabel('Room title', { exact: true }).fill(scenario.title)
        await form.getByRole('combobox', { name: /^Human seats/ }).selectOption(String(scenario.humans))
        if (scenario.locked) {
          await form.getByLabel('Password protection').check()
          await form.getByLabel('Room password').fill('night-club-17')
        }
        await form.getByRole('button', { name: 'Create room', exact: true }).click()
        const row = players[1].page.locator('tr[data-room-id]').filter({ hasText: scenario.title })
        await expect(row).toBeVisible()
        if (scenario.title === 'Friendly Belot') {
          observer = await enter(browser, baseURL!, 'Lobby observer')
          const reservation = observer.page
            .locator('tr[data-room-id]')
            .filter({ hasText: scenario.title })
          await expect(reservation.locator('.net-humans-cell')).toHaveText(/1\s*\/\s*2/)
        }
        const search = players[1].page.getByRole('searchbox')
        await search.fill('No such room')
        await expect(row).toHaveCount(0)
        await search.fill('Guest 1')
        await expect(row).toHaveCount(1)
        if (scenario.locked) {
          const browserPage = players[1].page
          await browserPage.getByRole('button', { name: 'Filters' }).click()
          await browserPage.getByLabel('No password', { exact: true }).check()
          await expect(row).toHaveCount(0)
          await browserPage.getByLabel('No password', { exact: true }).uncheck()
          await expect(row).toBeVisible()
        }
        await players[1].page.screenshot({ path: info.outputPath('room-browser.png') })
        for (const p of players.slice(1)) {
          const listing = p.page.locator('tr[data-room-id]').filter({ hasText: scenario.title })
          await listing.getByRole('button', { name: 'Join', exact: true }).click()
          if (scenario.locked) {
            const prompt = p.page.getByRole('dialog')
            await prompt.getByLabel('Room password').fill('wrong')
            await prompt.getByRole('button', { name: 'Join', exact: true }).click()
            await expect(prompt.getByRole('alert')).toHaveText('Incorrect room password.')
            await prompt.getByLabel('Room password').fill('night-club-17')
            await prompt.getByRole('button', { name: 'Join', exact: true }).click()
          }
          await expect(p.page.getByRole('button', { name: 'Ready up' })).toBeVisible()
          if (scenario.humans === 4 && p === players[1]) {
            const oldSeat = p.room?.seats.find((s) => s.name === 'Guest 2')?.seat
            await p.page.getByRole('button', { name: 'Take seat', exact: true }).last().click()
            await expect
              .poll(() => p.room?.seats.find((s) => s.name === 'Guest 2')?.seat)
              .not.toBe(oldSeat)
          }
        }
        await expect.poll(() => host.room?.humans).toBe(scenario.humans)
        const observedRoom = observer?.page
          .locator('tr[data-room-id]')
          .filter({ hasText: scenario.title })
        if (observedRoom) await expect(observedRoom.locator('.net-humans-cell')).toHaveText(/2\s*\/\s*2/)
        if (scenario.humans === 2) {
          const partner = host.room!.seats.find((s) => s.name === 'Guest 2')!.seat
          const destination = partner === 'north' ? 'east' : 'north'
          await host.page
            .locator('[data-seat="' + partner + '"]')
            .getByRole('button', { name: 'Manage seat' })
            .click()
          const manage = host.page.getByRole('dialog')
          await manage.getByRole('combobox').selectOption(destination)
          await manage.getByRole('button', { name: 'Swap seats' }).click()
          await expect
            .poll(() => players[1].room?.seats.find((s) => s.name === 'Guest 2')?.seat)
            .toBe(destination)
        } else await host.page.getByRole('button', { name: 'Shuffle teams' }).click()
        await host.page.getByLabel('Message the room').fill('Good luck at the table!')
        await host.page.getByRole('button', { name: 'Send', exact: true }).click()
        await expect(players[1].page.getByText('Good luck at the table!', { exact: true })).toBeVisible()
        for (const p of players) await p.page.getByRole('button', { name: 'Ready up' }).click()
        await host.page.screenshot({ path: info.outputPath('waiting-room.png') })
        await host.page.getByRole('button', { name: 'Start match' }).click()
        await Promise.all(players.map((p) => expect(p.page.locator('.arena')).toBeVisible()))
        if (observedRoom)
          await expect(observedRoom.getByRole('button', { name: 'Playing' })).toBeDisabled()
        const first = host.game!.matchId
        expect(new Set(players.map((p) => p.game?.view.seat)).size).toBe(scenario.humans)
        expect(players.every((p) => p.game?.matchId === first)).toBe(true)
        await host.page.screenshot({ path: info.outputPath('online-table.png') })
        await playHand(players)
        const complete = host.game!.view.phase === 'MATCH_COMPLETE'
        await host.page.getByRole('button', { name: 'Return to room', exact: true }).click()
        if (!complete)
          await host.page
            .getByRole('dialog')
            .getByRole('button', { name: 'Return to room', exact: true })
            .click()
        for (const p of players) await p.page.getByRole('button', { name: 'Ready up' }).click()
        await host.page.getByRole('button', { name: 'Start match' }).click()
        await expect
          .poll(() =>
            players.every(
              (p) =>
                p.game &&
                p.game.matchId !== first &&
                p.game.view.scores.us === 0 &&
                p.game.view.scores.them === 0,
            ),
          )
          .toBe(true)
        expect(new Set(players.map((p) => p.room?.id)).size).toBe(1)
        if (scenario.locked)
          for (const p of players) expect(JSON.stringify(p.messages)).not.toContain('night-club-17')
        if (observer)
          expect(observer.messages.some((e) => e.type === 'game' && e.game !== null)).toBe(false)
        for (const player of players) {
          await player.page.getByRole('button', { name: 'Leave room', exact: true }).click()
          await player.page
            .getByRole('dialog')
            .getByRole('button', { name: 'Leave match', exact: true })
            .click()
          await expect(player.page.getByRole('button', { name: 'Host room', exact: true })).toBeEnabled()
        }
        if (observedRoom) await expect(observedRoom).toHaveCount(0)
        await expect(search).toHaveValue('Guest 1')
        if (scenario.locked)
          await expect(players[1].page.getByLabel('No password', { exact: true })).toBeVisible()
      } finally {
        await observer?.context.close()
        await Promise.all(players.map((p) => p.context.close()))
      }
    },
  )
}
