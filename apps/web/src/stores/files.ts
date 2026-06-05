import { shallowRef, computed } from "vue"
import { defineStore } from "pinia"

export type ViewMode = "list" | "grid"
export type SortKey = "name" | "modified" | "type" | "size"

const STORAGE_KEY_VIEW = "vault.viewMode"
const STORAGE_KEY_ROOT_UPLOADS = "vault.allowRootUploads"

export const useFilesStore = defineStore("files", () => {
  const viewMode = shallowRef<ViewMode>(
    (localStorage.getItem(STORAGE_KEY_VIEW) as ViewMode) ?? "list",
  )
  const sortKey = shallowRef<SortKey>("name")
  const sortAsc = shallowRef(true)
  const selectedId = shallowRef<string | null>(null)

  const allowRootUploads = shallowRef<boolean>(
    localStorage.getItem(STORAGE_KEY_ROOT_UPLOADS) === "1",
  )

  const toggleSort = computed(() => !sortAsc.value)

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
    localStorage.setItem(STORAGE_KEY_VIEW, mode)
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

  function setAllowRootUploads(allow: boolean) {
    allowRootUploads.value = allow
    localStorage.setItem(STORAGE_KEY_ROOT_UPLOADS, allow ? "1" : "0")
  }

  return {
    viewMode, sortKey, sortAsc, selectedId, toggleSort,
    allowRootUploads,
    setViewMode, setSortKey, setSelectedId,
    setAllowRootUploads,
  }
})
