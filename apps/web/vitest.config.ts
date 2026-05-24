import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { playwright } from '@vitest/browser-playwright'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Browser-mode tests for @vault/web.
 *
 * Lives in the web package because Vitest browser mode needs the Vue plugin
 * in the transform pipeline, and `@vitejs/plugin-vue` is a web-package dep.
 *
 * Convention (ADR 0019 §E3):
 *   - `*.test.ts`         → workspace `unit` project (node)
 *   - `*.browser.test.ts` → this `web-browser` project (real Chromium)
 *
 * The workspace root `vitest.config.ts` references this file by path so
 * `pnpm test` from the root runs all three projects.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@":         path.resolve(fileURLToPath(import.meta.url), "../src"),
      "@vault/sdk": r("../../packages/sdk/src/index.ts"),
    },
  },
  test: {
    name: "web-browser",
    include: ["src/**/*.browser.test.ts"],
    setupFiles: ["./src/__test__/browser-setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
})
