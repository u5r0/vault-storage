import { ref, watch, onMounted } from "vue"

export type ThemeMode = "light" | "dim" | "dark"

const STORAGE_KEY = "vault.theme"

const mode = ref<ThemeMode>("dark")

function apply(next: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", next === "dark" || next === "dim")
  root.dataset.theme = next
}

export function useTheme() {
  onMounted(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "dark"
    mode.value = saved
    apply(saved)
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
