import { defineStore } from "pinia"
import { ref, shallowRef, computed } from "vue"
import { UploadManager, type UploadHandle } from "@vault/sdk"
import { client } from "@/lib/client"

/**
 * Wraps the SDK's framework-agnostic `UploadManager` in a Pinia store so
 * Vue components can react to queue changes. The store is intentionally
 * thin — all upload semantics (concurrency, restrictions, retry, cancel)
 * live in the SDK so they're shared with non-browser consumers.
 *
 * On `completed`, the handle is dropped from the queue and `lastCompletedAt`
 * is bumped — the file-list view watches that timestamp to invalidate its
 * TanStack Query cache and pull the new entry from the server.
 */

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 100)
const MAX_FILES = 20
const CONCURRENCY = 3

// `ItemInput` matches the shape AppHeader / FileList already produce.
// `data` is the actual `File`; the other fields are redundant with
// `File.name`/`type`/`size` but kept for source-call-site compatibility.
type ItemInput = { name: string; type: string; size: number; data: File }

export const useUploadStore = defineStore("upload", () => {
  const manager = new UploadManager(client, {
    concurrency: CONCURRENCY,
    maxFiles: MAX_FILES,
    maxFileSize: MAX_UPLOAD_MB * 1024 * 1024,
  })

  // The reactive surface for templates. Re-assigned on every `change`
  // event so Vue re-renders even though individual handle objects are
  // mutated in place by the manager.
  const files = ref<UploadHandle[]>([])

  const currentEntityId = shallowRef<string | null>(null)
  const lastCompletedAt = shallowRef(0)

  function sync() {
    files.value = manager.list().slice()
  }

  manager.on("change", sync)
  manager.on("completed", (handle) => {
    // Match the previous Uppy behavior: completed files leave the queue,
    // and the file-list view refetches from the timestamp bump.
    manager.remove(handle.id)
    lastCompletedAt.value = Date.now()
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
