import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { chromium } from '@playwright/test'
const offline = process.env.BELOT_OFFLINE_TEST === '1'
const port = Number(process.env.BELOT_TEST_PORT ?? 5173)
const url = 'http://127.0.0.1:' + port
const browser =
  process.env.BELOT_CHROMIUM ??
  (existsSync(chromium.executablePath())
    ? undefined
    : [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ].find(existsSync))
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 8000 },
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: offline ? 'https://belot.test' : url,
    viewport: { width: 1400, height: 920 },
    launchOptions: { executablePath: browser },
    screenshot: 'only-on-failure',
  },
  webServer: offline
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ' + port + ' --strictPort',
        url,
        reuseExistingServer: true,
        timeout: 45_000,
      },
})
