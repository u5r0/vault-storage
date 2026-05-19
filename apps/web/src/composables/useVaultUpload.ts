import Uppy from "@uppy/core"
import XHRUpload from "@uppy/xhr-upload"
import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue"

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 100)

function createUppyInstance(parentId: string | null) {
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
    headers: {
      "Accept": "application/json",
    },
  })
}

export function useVaultUpload(options: {
  currentEntityId: Ref<string | null>
  onUploadComplete: () => void
}) {
  const uppy = shallowRef(createUppyInstance(options.currentEntityId.value))
  const hasPending = ref(false)

  function refreshPending() {
    hasPending.value = uppy.value
      .getFiles()
      .some((file) => !file.progress?.uploadComplete)
  }

  uppy.value.on("file-added", (file) => {
    uppy.value.setFileMeta(file.id, { parentId: options.currentEntityId.value ?? null })
    refreshPending()
  })

  uppy.value.on("file-removed", refreshPending)
  uppy.value.on("upload-progress", refreshPending)
  uppy.value.on("upload-success", refreshPending)
  uppy.value.on("upload-error", refreshPending)

  uppy.value.on("complete", (result) => {
    if (result.successful?.length) {
      for (const file of result.successful) {
        uppy.value.removeFile(file.id)
      }
      refreshPending()
      options.onUploadComplete()
    }
  })

  watch(options.currentEntityId, (newId) => {
    // Recreate uppy instance with new parentId
    uppy.value.destroy()
    uppy.value = createUppyInstance(newId)
    refreshPending()
  })

  onBeforeUnmount(() => {
    uppy.value.destroy()
  })

  return { uppy, hasPending }
}
