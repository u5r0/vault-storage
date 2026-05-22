import { ref, computed } from "vue"
import { defineStore } from "pinia"

export type ViewMode = "list" | "grid"
export type SortKey = "name" | "modified" | "type" | "size"

const STORAGE_KEY_VIEW = "vault.viewMode"
const STORAGE_KEY_ROOT_UPLOADS = "vault.allowRootUploads"

export const useFilesStore = defineStore("files", () => {
  const viewMode = ref<ViewMode>(
    (localStorage.getItem(STORAGE_KEY_VIEW) as ViewMode) ?? "list",
  )
  const sortKey = ref<SortKey>("name")
  const sortAsc = ref(true)
  const selectedId = ref<string | null>(null)

  // Whether dropping or uploading at the root is permitted. Off by default —
  // matches the intuition that root is a "library" rather than a folder you
  // dump things into. Users can opt in from Settings → Files.
  const allowRootUploads = ref<boolean>(
    localStorage.getItem(STORAGE_KEY_ROOT_UPLOADS) === "1",
  )

  // Used by AppHeader to trigger folder creation from outside the files route
  const createFolderRequested = ref<string | null>(null)

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

  function requestCreateFolder(name: string) {
    createFolderRequested.value = name
  }

  function clearCreateFolderRequest() {
    createFolderRequested.value = null
  }

  return {
    viewMode, sortKey, sortAsc, selectedId, toggleSort,
    allowRootUploads,
    createFolderRequested,
    setViewMode, setSortKey, setSelectedId,
    setAllowRootUploads,
    requestCreateFolder, clearCreateFolderRequest,
  }
})
