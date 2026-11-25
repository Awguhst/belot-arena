import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@belot/game-engine': at('./packages/game-engine/src/index.ts'),
      '@belot/bots': at('./packages/bots/src/index.ts'),
    },
  },
  test: { include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'] },
})
