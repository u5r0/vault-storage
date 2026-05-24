import type { Component } from "vue"
import type { RouterOptions } from "vue-router"
import { createMemoryHistory, createRouter } from "vue-router"
import { render } from "vitest-browser-vue"

import VButton      from "@/components/v-button.vue"
import VInput       from "@/components/v-input.vue"
import VSpinner     from "@/components/v-spinner.vue"
import VEmptyState  from "@/components/v-empty-state.vue"
import VBadge       from "@/components/v-badge.vue"

/**
 * Global components registered for browser-mode component tests. Mirrors the
 * runtime `registerGlobals(app)` registration in `src/components/register.ts`
 * — kept in sync manually because `render()` accepts a `global.components`
 * map, not an `App` instance.
 */
export const globalComponents = {
  "v-button":      VButton,
  "v-input":       VInput,
  "v-spinner":     VSpinner,
  "v-empty-state": VEmptyState,
  "v-badge":       VBadge,
}

/**
 * No-op stub so components that use `v-click-outside` mount cleanly without
 * having to wire the real directive (which depends on document listeners).
 */
export const globalDirectives = {
  "click-outside": {
    mounted: () => {},
    unmounted: () => {},
  },
}

interface MountOptions {
  /** Initial URL to push before render (e.g. "/verify?token=foo"). */
  url: string
  /** Routes the test cares about — usually a sub-set of the real router. */
  routes: RouterOptions["routes"]
}

/**
 * Mount a Vue component inside a real Chromium page (vitest-browser-vue),
 * with router + global v-* components + click-outside directive ready.
 *
 * Awaits `router.isReady()` so route params/query are available on the first
 * render — without this, vue-router warns "No match found for path ''".
 */
export async function mountWithRouter(component: Component, options: MountOptions) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes,
  })
  router.push(options.url)
  await router.isReady()

  const utils = render(component, {
    global: {
      plugins: [router],
      components: globalComponents,
      directives: globalDirectives,
    },
  })

  return { utils, router }
}
