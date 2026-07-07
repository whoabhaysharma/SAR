import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed.ts'),
      name: 'BunnyTag',
      fileName: 'adbunny',
    },
    outDir: 'dist',
  },
})
