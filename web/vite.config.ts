import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [solid()],
  // PocketBase serves this tree at /nors/
  base: '/nors/',
  // Dev only: same-origin /api so local UI talks to a tunneled PB without
  // CORS or Cloudflare Access in the path. Never affects the build.
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.NORS_PB_PORT ?? 8090}`,
    },
  },
  build: {
    outDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pb_public/nors'),
    sourcemap: false,
    // keep the ship small — micro constraint
    target: 'es2022',
  },
})
