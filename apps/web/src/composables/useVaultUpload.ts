import Uppy from "@uppy/core"
import XHRUpload from "@uppy/xhr-upload"
import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue"

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 100)

function blobPath(folderPath: string, fileName: string): string {
  const prefix = folderPath ? `${folderPath.replace(/\/+$/, "")}/` : ""
  return `${prefix}${fileName.replace(/^\/+/, "")}`
}

async function fetchUploadUrl(targetPath: string): Promise<string> {
  const res = await fetch(`/api/files/sas?path=${encodeURIComponent(targetPath)}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "Failed to get upload URL")
  }
  const { uploadUrl } = (await res.json()) as { uploadUrl: string }
  return uploadUrl
}

function createUppyInstance() {
  return new Uppy({
    autoProceed: false,
    restrictions: {
      maxNumberOfFiles: 20,
      maxFileSize: MAX_UPLOAD_MB * 1024 * 1024,
    },
  }).use(XHRUpload, {
    method: "PUT",
    formData: false,
    allowedMetaFields: [],
    limit: 3,
    endpoint: async (fileOrBundle) => {
      const file = Array.isArray(fileOrBundle) ? fileOrBundle[0] : fileOrBundle
      const folderPath = (file.meta?.folderPath as string | undefined) ?? ""
      return fetchUploadUrl(blobPath(folderPath, file.name))
    },
    headers: (fileOrBundle) => {
      const file = Array.isArray(fileOrBundle) ? fileOrBundle[0] : fileOrBundle
      return {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": file.type || "application/octet-stream",
      }
    },
  })
}

export function useVaultUpload(options: {
  currentPath: Ref<string>
  onUploadComplete: () => void
}) {
  const uppy = shallowRef(createUppyInstance())
  const hasPending = ref(false)

  function refreshPending() {
    hasPending.value = uppy.value
      .getFiles()
      .some((file) => !file.progress?.uploadComplete)
  }

  uppy.value.on("file-added", (file) => {
    uppy.value.setFileMeta(file.id, { folderPath: options.currentPath.value })
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

  watch(options.currentPath, () => {
    for (const file of uppy.value.getFiles()) {
      uppy.value.removeFile(file.id)
    }
    refreshPending()
  })

  onBeforeUnmount(() => {
    uppy.value.destroy()
  })

  return { uppy, hasPending }
}
