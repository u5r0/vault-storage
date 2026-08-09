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
          env: {                                                                                                                                                                                                      
            AUTH_SECRET: "unit-test-auth-secret",                                                                                                                                                                     
            JWT_SECRET: "unit-test-jwt-secret",                                                                                                                                                                       
          },
          include: [
            "apps/server/src/services/**/*.test.ts",
            "apps/server/src/lib/**/*.test.ts",
            "apps/server/src/middleware/**/*.test.ts",
            "apps/web/src/**/*.test.ts",
            "packages/**/*.test.ts",
          ],
          exclude: [
            "**/node_modules/**",
            "apps/web/src/**/*.browser.test.ts",
            // Integration tests under lib/ use real infrastructure (RustFS).
            // Keep them out of the unit project.
            "apps/server/src/lib/**/*.integration.test.ts",
          ],
          setupFiles: [],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [
            // The HTTP surface — provider-agnostic by design (everything
            // routes through `getBlobStore()`). Tested once against the
            // default provider (Azurite). Cross-provider confidence comes
            // from the layered strategy: the R2BlobStore adapter test
            // verifies the contract for R2, and a unit test on
            // `blob-provider` verifies provider selection.
            "apps/server/src/controllers/**/*.test.ts",
            // Adapter-level integration: R2BlobStore against RustFS.
            "apps/server/src/lib/**/*.integration.test.ts",
          ],
          globalSetup: [
            "./apps/server/src/__setup__/blob.global.ts",
            "./apps/server/src/__setup__/cosmos.global.ts",
            "./apps/server/src/__setup__/mailpit.global.ts",
          ],
          setupFiles: [
            "./apps/server/src/__setup__/blob.env.ts",
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
