import { ref, watch } from "vue"
import { defineStore } from "pinia"

export type ThemeMode = "light" | "dark"

const THEME_KEY = "vault.theme"

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", mode === "dark")
  root.dataset.theme = mode
}

function normalizeMode(value: string | null): ThemeMode {
  return value === "light" ? "light" : "dark"
}

export const useUIStore = defineStore("ui", () => {
  const theme = ref<ThemeMode>(normalizeMode(localStorage.getItem(THEME_KEY)))
  const sidebarCollapsed = ref(false)

  watch(
    theme,
    (next) => {
      applyTheme(next)
      localStorage.setItem(THEME_KEY, next)
    },
    { immediate: true },
  )

  function setTheme(mode: ThemeMode) {
    theme.value = mode
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { theme, sidebarCollapsed, setTheme, toggleSidebar }
})
