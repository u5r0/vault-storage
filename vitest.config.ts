import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Two projects:
 *  - `unit`        — fast, no fixtures. Co-located *.test.ts in services/, lib/,
 *                    middleware/, web/, and packages/. Mocks everything.
 *  - `integration` — boots Azurite + Cosmos DB emulator; exercises the full HTTP
 *                    stack via app.request(). Tests live in controllers/ (co-located
 *                    with the routes they exercise). Infrastructure in __setup__/.
 *
 * See ADR 0017 — Test Layout: Co-location + Package Ownership.
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
            "apps/server/src/services/**/*.test.ts",
            "apps/server/src/lib/**/*.test.ts",
            "apps/server/src/middleware/**/*.test.ts",
            "apps/web/src/**/*.test.ts",
            "packages/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["apps/server/src/controllers/**/*.test.ts"],
          globalSetup: [
            "./apps/server/src/__setup__/azurite.global.ts",
            "./apps/server/src/__setup__/cosmos.global.ts",
          ],
          setupFiles: [
            "./apps/server/src/__setup__/azurite.env.ts",
            "./apps/server/src/__setup__/cosmos.env.ts",
          ],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
