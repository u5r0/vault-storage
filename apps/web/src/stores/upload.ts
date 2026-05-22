import Uppy from "@uppy/core"
import XHRUpload from "@uppy/xhr-upload"
import { defineStore } from "pinia"
import { ref, shallowRef } from "vue"

// Uppy's file type generics are deeply contravariant and not useful at the UI layer.
// We only care about name, progress, and id — use a minimal shape.
export interface UploadFile {
  id: string
  name: string
  progress?: { percentage?: number; uploadComplete?: boolean; uploadStarted?: number | null }
}

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 100)

export const useUploadStore = defineStore("upload", () => {
  const uppy = shallowRef<Uppy | null>(null)
  const files = ref<UploadFile[]>([])
  const hasPending = ref(false)
  const isUploading = ref(false)
  const currentEntityId = ref<string | null>(null)

  /**
   * Bumped each time an upload batch completes. Routes can `watch()` this to
   * trigger a refresh of their listings without prop-drilling callbacks.
   */
  const lastCompletedAt = ref(0)

  function syncFiles(u: Uppy) {
    files.value = u.getFiles() as unknown as UploadFile[]
    hasPending.value = files.value.some((f) => !f.progress?.uploadComplete)
    isUploading.value = files.value.some(
      (f) => f.progress?.uploadStarted && !f.progress?.uploadComplete,
    )
  }

  function ensureUppy(): Uppy {
    if (uppy.value) return uppy.value

    const instance = new Uppy({
      autoProceed: true,
      restrictions: {
        maxNumberOfFiles: 20,
        maxFileSize: MAX_UPLOAD_MB * 1024 * 1024,
      },
    }).use(XHRUpload, {
      method: "POST",
      formData: true,
      fieldName: "files",
      allowedMetaFields: ["parentId"],
      limit: 3,
      endpoint: "/api/files/upload",
      headers: { Accept: "application/json" },
    })

    instance.on("file-added", (file) => {
      instance.setFileMeta(file.id, { parentId: currentEntityId.value ?? null })
      syncFiles(instance)
    })
    instance.on("file-removed",    () => syncFiles(instance))
    instance.on("upload-progress", () => syncFiles(instance))
    instance.on("upload-success",  () => syncFiles(instance))
    instance.on("upload-error",    () => syncFiles(instance))
    instance.on("complete", (result) => {
      if (result.successful?.length) {
        for (const f of result.successful) instance.removeFile(f.id)
        syncFiles(instance)
        lastCompletedAt.value = Date.now()
      }
    })

    uppy.value = instance
    return instance
  }

  function setCurrentEntity(id: string | null) {
    currentEntityId.value = id
  }

  function addFiles(items: Array<{ name: string; type: string; size: number; data: File }>) {
    ensureUppy().addFiles(items)
  }

  function removeFile(id: string) {
    uppy.value?.removeFile(id)
  }

  return {
    uppy,
    files,
    hasPending,
    isUploading,
    currentEntityId,
    lastCompletedAt,
    ensureUppy,
    setCurrentEntity,
    addFiles,
    removeFile,
  }
})
