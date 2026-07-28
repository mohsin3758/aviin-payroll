import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Requires a live dev server (`npm run dev`) with a seeded database on localhost:3000.
// Not part of the default `npm test` run — these hit real HTTP endpoints, not mocks.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // These hit a live `next dev` server with Turbopack's per-route lazy compilation — the
    // first request to any given route can take several seconds to compile, especially right
    // after a cache clear. Hermetic unit tests don't need this; these do.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
})
