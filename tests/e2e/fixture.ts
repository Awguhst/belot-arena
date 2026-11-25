import { expect, test as base } from '@playwright/test'
import { existsSync } from 'node:fs'
import { relative, resolve, isAbsolute } from 'node:path'

/** Allows the built application and its dedicated workers to run without a listening socket. */
export const test = base.extend<{ localBuild: void }>({
  localBuild: [
    async ({ context }, use) => {
      if (process.env.BELOT_OFFLINE_TEST === '1') {
        const root = resolve('dist')
        if (!existsSync(resolve(root, 'index.html')))
          throw new Error('Run pnpm build before the offline browser suite')
        await context.route('https://belot.test/**', async (route) => {
          const path = decodeURIComponent(new URL(route.request().url()).pathname)
          const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
          const child = relative(root, file)
          if (isAbsolute(child) || child.startsWith('..') || !existsSync(file)) {
            await route.fulfill({ status: 404, body: '' })
            return
          }
          await route.fulfill({ path: file })
        })
      }
      await use()
    },
    { auto: true },
  ],
})
export { expect }
