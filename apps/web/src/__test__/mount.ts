import type { Component } from "vue"
import type { RouterOptions } from "vue-router"
import { createMemoryHistory, createRouter } from "vue-router"
import { render } from "vitest-browser-vue"
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query"

import VButton      from "@/components/v-button.vue"
import VInput       from "@/components/v-input.vue"
import VSpinner     from "@/components/v-spinner.vue"
import VEmptyState  from "@/components/v-empty-state.vue"
import VBadge       from "@/components/v-badge.vue"

export const globalComponents = {
  "v-button":      VButton,
  "v-input":       VInput,
  "v-spinner":     VSpinner,
  "v-empty-state": VEmptyState,
  "v-badge":       VBadge,
}

export const globalDirectives = {
  "click-outside": {
    mounted: () => {},
    unmounted: () => {},
  },
}

interface MountOptions {
  url: string
  routes: RouterOptions["routes"]
}

export async function mountWithRouter(component: Component, options: MountOptions) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes,
  })
  router.push(options.url)
  await router.isReady()

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utils = render(component, {
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient }]],
      components: globalComponents,
      directives: globalDirectives,
    },
  })

  return { utils, router, queryClient }
}
