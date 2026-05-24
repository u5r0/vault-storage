/**
 * Per-test setup for `vitest --project web-browser`.
 *
 * Browser-mode runs each test in a real Chromium page via @vitest/browser. We
 * use vitest-browser-vue's `render()` to mount components inside that page;
 * this setup file just provides the cross-test plumbing (fresh Pinia instance
 * per test, fetch reset between tests).
 */

import { afterEach, beforeEach, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"

beforeEach(() => {
  // Each test gets its own Pinia so stores don't bleed state across tests.
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})
