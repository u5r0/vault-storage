import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Two projects:
 *  - `unit`        — fast, no fixtures, picks up *.test.ts co-located with source.
 *  - `integration` — boots Azurite in-memory in a global setup; talks to the
 *                    Hono app via `app.request(...)`.
 *
 * See ADR 0005 for the testing strategy.
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
            "server/**/*.test.ts",
            "app/**/*.test.ts",
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
          testTimeout: 20_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
