import { ref, watch, onMounted } from "vue"

export type ThemeMode = "light" | "dark"

const STORAGE_KEY = "vault.theme"

const mode = ref<ThemeMode>("dark")

function apply(next: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", next === "dark")
  root.dataset.theme = next
}

function normalizeMode(value: string | null): ThemeMode {
  if (value === "light") return "light"
  // Legacy persisted value — treat as dark.
  return "dark"
}

export function useTheme() {
  onMounted(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = normalizeMode(raw)
    mode.value = saved
    apply(saved)
    if (raw !== saved) {
      localStorage.setItem(STORAGE_KEY, saved)
    }
  })

  watch(mode, (next) => {
    apply(next)
    localStorage.setItem(STORAGE_KEY, next)
  })

  function setMode(next: ThemeMode) {
    mode.value = next
  }

  return { mode, setMode }
}
