import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { attachMultiplayer } from './apps/server/src/transport'
import { buildBotWorker } from './scripts/build-bot-worker.ts'
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  root: at('./apps/web'),
  plugins: [
    react(),
    tailwind(),
    {
      name: 'belot-multiplayer',
      async configureServer(server) {
        if (server.httpServer) {
          await buildBotWorker()
          server.middlewares.use(attachMultiplayer(server.httpServer))
        }
      },
      async configurePreviewServer(server) {
        await buildBotWorker()
        server.middlewares.use(attachMultiplayer(server.httpServer))
      },
    },
  ],
  resolve: {
    alias: {
      '@belot/game-engine': at('./packages/game-engine/src/index.ts'),
      '@belot/bots': at('./packages/bots/src/index.ts'),
    },
  },
  build: { outDir: at('./dist'), emptyOutDir: true, license: { fileName: 'DEPENDENCIES.md' } },
  server: { fs: { allow: [at('.')] } },
})
