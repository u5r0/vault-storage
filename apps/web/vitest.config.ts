import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { playwright } from "@vitest/browser-playwright"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@":          path.resolve(fileURLToPath(import.meta.url), "../src"),
      "@vault/sdk": r("../../packages/sdk/src/index.ts"),
    },
  },
  test: {
    name: "web-browser",
    include: ["apps/web/src/**/*.browser.test.ts"],
    setupFiles: ["apps/web/src/__test__/browser-setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
})
