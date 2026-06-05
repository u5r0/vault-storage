import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

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
          exclude: ["**/node_modules/**", "apps/web/src/**/*.browser.test.ts"],
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
            "./apps/server/src/__setup__/mailpit.global.ts",
          ],
          setupFiles: [
            "./apps/server/src/__setup__/azurite.env.ts",
            "./apps/server/src/__setup__/cosmos.env.ts",
            "./apps/server/src/__setup__/mailpit.env.ts",
          ],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
      "./apps/web/vitest.config.ts",
    ],
  },
})
