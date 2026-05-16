import type { VaultEntry } from "@vault/sdk"

export function formatSize(bytes: number): string {
  if (bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

const MIME_LABELS: Record<string, string> = {
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "audio/wav": "Audio",
  "audio/mpeg": "Audio",
  "application/zip": "Archive",
  "application/x-tar": "Archive",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
}

export function typeLabel(entry: VaultEntry): string {
  if (entry.type === "folder") return "Folder"
  if (entry.contentType) return MIME_LABELS[entry.contentType] ?? entry.contentType.split("/")[1]?.toUpperCase() ?? "File"
  return entry.name.split(".").pop()?.toUpperCase() ?? "File"
}
