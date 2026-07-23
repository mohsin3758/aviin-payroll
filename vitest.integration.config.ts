import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Requires a live dev server (`npm run dev`) with a seeded database on localhost:3000.
// Not part of the default `npm test` run — these hit real HTTP endpoints, not mocks.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
  },
})
