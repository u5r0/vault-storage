import Uppy from "@uppy/core"
import XHRUpload from "@uppy/xhr-upload"
import { inject, onBeforeUnmount, provide, ref, shallowRef, watch, type InjectionKey, type Ref } from "vue"

// Uppy's file type generics are deeply contravariant and not useful at the UI layer.
// We only care about name, progress, and id — use a minimal shape.
export interface UploadFile {
  id: string
  name: string
  progress?: { percentage?: number; uploadComplete?: boolean; uploadStarted?: number | null }
}

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 100)

// Injection key so AppHeader can add files to the active FileList uppy instance
export const UPPY_KEY: InjectionKey<Ref<Uppy | null>> = Symbol("uppy")

function createUppyInstance() {
  return new Uppy({
    autoProceed: false,
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
}

export function useVaultUpload(options: {
  currentEntityId: Ref<string | null>
  onUploadComplete: () => void
}) {
  const uppy = shallowRef(createUppyInstance())
  const files = ref<UploadFile[]>([])
  const hasPending = ref(false)

  // Provide the active uppy instance so AppHeader can add files to it
  provide(UPPY_KEY, uppy)

  function syncFiles() {
    files.value = uppy.value.getFiles() as unknown as UploadFile[]
    hasPending.value = files.value.some((f) => !f.progress?.uploadComplete)
  }

  uppy.value.on("file-added", (file) => {
    uppy.value.setFileMeta(file.id, { parentId: options.currentEntityId.value ?? null })
    syncFiles()
  })
  uppy.value.on("file-removed",    syncFiles)
  uppy.value.on("upload-progress", syncFiles)
  uppy.value.on("upload-success",  syncFiles)
  uppy.value.on("upload-error",    syncFiles)

  uppy.value.on("complete", (result) => {
    if (result.successful?.length) {
      for (const file of result.successful) uppy.value.removeFile(file.id)
      syncFiles()
      options.onUploadComplete()
    }
  })

  watch(options.currentEntityId, () => {
    uppy.value.destroy()
    uppy.value = createUppyInstance()
    syncFiles()
  })

  onBeforeUnmount(() => uppy.value.destroy())

  return { uppy, files, hasPending }
}
