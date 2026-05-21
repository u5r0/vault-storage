import type { App, Directive } from "vue"
import VButton from "./v-button.vue"
import VInput from "./v-input.vue"
import VSpinner from "./v-spinner.vue"
import VEmptyState from "./v-empty-state.vue"
import VBadge from "./v-badge.vue"

const clickOutside: Directive = {
  mounted(el, binding) {
    el.__clickOutsideHandler__ = (event: MouseEvent) => {
      if (!el.contains(event.target as Node)) {
        binding.value(event)
      }
    }
    document.addEventListener("click", el.__clickOutsideHandler__)
  },
  unmounted(el) {
    document.removeEventListener("click", el.__clickOutsideHandler__)
  },
}

export function registerGlobals(app: App) {
  app.component("v-button", VButton)
  app.component("v-input", VInput)
  app.component("v-spinner", VSpinner)
  app.component("v-empty-state", VEmptyState)
  app.component("v-badge", VBadge)

  app.directive("click-outside", clickOutside)
}
