import * as z from "zod"

/* ======================== Types ======================== */

export const VaultEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "folder"]),
  size: z.number(),
  contentType: z.string().nullable(),
  modifiedAt: z.string().nullable(),
})

export type VaultEntry = z.infer<typeof VaultEntrySchema>

/* ======================== Client ======================== */

export interface VaultStore {
  listFiles(input?: { path?: string }): Promise<{ path: string; entries: VaultEntry[] }>
  createFolder(input: { path?: string; name: string }): Promise<{ path: string; type: "folder" }>
  uploadFiles(input: { path?: string; files: File[] }): Promise<{ uploaded: VaultEntry[] }>
  getDownloadUrl(path: string): string
  renameFile(input: { from: string; to: string }): Promise<{ path: string }>
  deleteFile(input: { path: string; isFolder?: boolean }): Promise<{ deleted: number }>
}

export class VaultClient implements VaultStore {
  constructor(private baseUrl: string) {}

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /* ======================== Files API ======================== */

  async listFiles(input: { path?: string } = {}) {
    const path = input.path || ""
    return this.request<{ path: string; entries: VaultEntry[] }>(
      `/api/files?path=${encodeURIComponent(path)}`
    )
  }

  async createFolder(input: { path?: string; name: string }) {
    return this.request<{ path: string; type: "folder" }>(
      `/api/files/folder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
  }

  async uploadFiles(input: { path?: string; files: File[] }) {
    const formData = new FormData()
    if (input.path) formData.append("path", input.path)
    input.files.forEach((file) => formData.append("files", file))

    return this.request<{ uploaded: VaultEntry[] }>(
      `/api/files/upload`,
      {
        method: "POST",
        body: formData,
      }
    )
  }

  getDownloadUrl(path: string): string {
    return `${this.baseUrl}/api/files/download?path=${encodeURIComponent(path)}`
  }

  async renameFile(input: { from: string; to: string }) {
    return this.request<{ path: string }>(
      `/api/files/rename`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
  }

  async deleteFile(input: { path: string; isFolder?: boolean }) {
    return this.request<{ deleted: number }>(
      `/api/files`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
  }
}

/* ======================== Factory ======================== */

export function createVaultClient(baseUrl: string): VaultClient {
  return new VaultClient(baseUrl)
}
