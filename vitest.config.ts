import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Two projects:
 *  - `unit`        — fast, no fixtures, picks up *.test.ts co-located with source.
 *  - `integration` — boots Azurite/Cosmos DB in global setup; talks to the
 *                    Hono app via `app.request(...)`. Organized by feature.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@vault/sdk": r("./packages/sdk/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "apps/server/src/**/*.test.ts",
            "apps/web/src/**/*.test.ts",
            "packages/**/*.test.ts",
          ],
          exclude: ["tests/integration/**", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/setup/azurite.global.ts"],
          setupFiles: ["./tests/setup/azurite.env.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
