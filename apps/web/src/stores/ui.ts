import { shallowRef, watch } from "vue"
import { defineStore } from "pinia"

export type ThemeMode = "light" | "dark"
export type SearchType = "file" | "folder" | undefined

const THEME_KEY = "vault.theme"

function applyThemeColorMeta(mode: ThemeMode) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#fcf9f5")
  }
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", mode === "dark")
  root.dataset.theme = mode
  applyThemeColorMeta(mode)
}

function normalizeMode(value: string | null): ThemeMode {
  return value === "light" ? "light" : "dark"
}

export const useUIStore = defineStore("ui", () => {
  const theme = shallowRef<ThemeMode>(normalizeMode(localStorage.getItem(THEME_KEY)))
  const sidebarCollapsed = shallowRef(false)

  const searchQuery = shallowRef("")
  const searchType = shallowRef<SearchType>(undefined)
  const searchOpen = shallowRef(false)

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

  function setSearchQuery(q: string) {
    searchQuery.value = q
  }

  function setSearchType(type: SearchType) {
    searchType.value = type
  }

  function clearSearch() {
    searchQuery.value = ""
    searchType.value = undefined
  }

  return {
    theme,
    sidebarCollapsed,
    searchQuery,
    searchType,
    searchOpen,
    setTheme,
    toggleSidebar,
    setSearchQuery,
    setSearchType,
    clearSearch,
  }
})
