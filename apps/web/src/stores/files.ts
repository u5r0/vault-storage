import { ref, computed } from "vue"
import { defineStore } from "pinia"

export type ViewMode = "list" | "grid"
export type SortKey = "name" | "modified" | "type" | "size"

const STORAGE_KEY = "vault.viewMode"

export const useFilesStore = defineStore("files", () => {
  const viewMode = ref<ViewMode>(
    (localStorage.getItem(STORAGE_KEY) as ViewMode) ?? "list",
  )
  const sortKey = ref<SortKey>("name")
  const sortAsc = ref(true)
  const selectedId = ref<string | null>(null)

  const toggleSort = computed(() => !sortAsc.value)

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
    localStorage.setItem(STORAGE_KEY, mode)
  }

  function setSortKey(key: SortKey) {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value
    } else {
      sortKey.value = key
      sortAsc.value = true
    }
  }

  function setSelectedId(id: string | null) {
    selectedId.value = id
  }

  return { viewMode, sortKey, sortAsc, selectedId, toggleSort, setViewMode, setSortKey, setSelectedId }
})
