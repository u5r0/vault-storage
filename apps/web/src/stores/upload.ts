import { defineStore } from "pinia"
import { ref, shallowRef, computed, watch } from "vue"
import { UploadManager, type UploadHandle } from "@vault/sdk"
import { client } from "@/lib/client"
import { useConfigStore } from "@/stores/config"
import { useSettingsStore } from "@/stores/settings"
import { useVaultIndex } from "@/modules/files/composables/useVaultIndex"

/**
 * Wraps the SDK's framework-agnostic `UploadManager` in a Pinia store so
 * Vue components can react to queue changes. The store is intentionally
 * thin — all upload semantics (concurrency, restrictions, retry, cancel)
 * live in the SDK so they're shared with non-browser consumers.
 *
 * On `completed`, the handle is dropped from the queue and `lastCompletedAt`
 * is bumped — the file-list view watches that timestamp to invalidate its
 * TanStack Query cache and pull the new entry from the server.
 * The local MiniSearch index is also updated incrementally so search
 * results reflect uploads immediately.
 */

const MAX_FILES = 20
const CONCURRENCY = 3

// `ItemInput` matches the shape AppHeader / FileList already produce.
// `data` is the actual `File`; the other fields are redundant with
// `File.name`/`type`/`size` but kept for source-call-site compatibility.
type ItemInput = { name: string; type: string; size: number; data: File }

export const useUploadStore = defineStore("upload", () => {
  const config = useConfigStore()
  const settings = useSettingsStore()
  const manager = new UploadManager(client, {
    concurrency: CONCURRENCY,
    maxFiles: MAX_FILES,
    maxFileSize: config.maxUploadMb * 1024 * 1024,
  })

  // Effective per-file limit: per-account override wins over the server
  // default. Watched so a Settings change updates the manager without a
  // rebuild. The server 413 remains authoritative regardless.
  const effectiveMaxUploadMb = computed(() => settings.maxUploadMb ?? config.maxUploadMb)

  watch(
    effectiveMaxUploadMb,
    (mb) => manager.updateMaxFileSize(mb * 1024 * 1024),
    { immediate: true },
  )

  // The reactive surface for templates. Re-assigned on every `change`
  // event so Vue re-renders even though individual handle objects are
  // mutated in place by the manager.
  const files = ref<UploadHandle[]>([])

  const currentEntityId = shallowRef<string | null>(null)
  const lastCompletedAt = shallowRef(0)
  const index = useVaultIndex(client)

  function sync() {
    files.value = manager.list().slice()
  }

  manager.on("change", sync)
  manager.on("completed", (handle) => {
    // Match the previous Uppy behavior: completed files leave the queue,
    // and the file-list view refetches from the timestamp bump.
    manager.remove(handle.id)
    lastCompletedAt.value = Date.now()
    
    // Update the local MiniSearch index incrementally so search results
    // reflect uploads immediately without waiting for re-hydration.
    if (handle.state.status === "completed") {
      index.addEntry(handle.state.entry)
    }
  })

  const hasPending = computed(() =>
    files.value.some(
      (f) => f.state.status === "pending" || f.state.status === "uploading",
    ),
  )

  const isUploading = computed(() =>
    files.value.some((f) => f.state.status === "uploading"),
  )

  function setCurrentEntity(id: string | null) {
    currentEntityId.value = id
  }

  function addFiles(items: ItemInput[]) {
    for (const item of items) {
      manager.add({ file: item.data, parentId: currentEntityId.value })
    }
  }

  function removeFile(id: string) {
    manager.remove(id)
  }

  return {
    files,
    hasPending,
    isUploading,
    currentEntityId,
    lastCompletedAt,
    setCurrentEntity,
    addFiles,
    removeFile,
  }
})

// Re-export the SDK type so components can import it from the store
// without reaching into the SDK directly.
export type { UploadHandle } from "@vault/sdk"
