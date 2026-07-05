import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
})
