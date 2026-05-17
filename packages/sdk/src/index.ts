import * as z from "zod"

/* ======================== Entities ======================== */

export const VaultEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "folder"]),
  size: z.number(),
  contentType: z.string().nullable(),
  modifiedAt: z.string().nullable(),
})

export type VaultEntry = z.infer<typeof VaultEntrySchema>

/* ======================== Request schemas ======================== */

export const ListFilesQuery = z.object({
  path: z.string().optional().default(""),
})
export type ListFilesInput = z.infer<typeof ListFilesQuery>

export const CreateFolderBody = z.object({
  path: z.string().optional().default(""),
  name: z.string().min(1).max(255),
})
export type CreateFolderInput = z.infer<typeof CreateFolderBody>

export const RenameBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
})
export type RenameInput = z.infer<typeof RenameBody>

export const DeleteBody = z.object({
  path: z.string().min(1),
  isFolder: z.boolean().optional().default(false),
})
export type DeleteInput = z.infer<typeof DeleteBody>

/* ======================== Response schemas ======================== */

export const ListFilesResponse = z.object({
  path: z.string(),
  entries: z.array(VaultEntrySchema),
})
export type ListFilesResult = z.infer<typeof ListFilesResponse>

export const CreateFolderResponse = z.object({
  path: z.string(),
  type: z.literal("folder"),
})
export type CreateFolderResult = z.infer<typeof CreateFolderResponse>

export const UploadResponse = z.object({
  uploaded: z.array(VaultEntrySchema),
})
export type UploadResult = z.infer<typeof UploadResponse>

export const RenameResponse = z.object({
  path: z.string(),
})
export type RenameResult = z.infer<typeof RenameResponse>

export const DeleteResponse = z.object({
  deleted: z.number(),
})
export type DeleteResult = z.infer<typeof DeleteResponse>

/* ======================== Client ======================== */

export interface VaultStore {
  listFiles(input?: Partial<ListFilesInput>): Promise<ListFilesResult>
  createFolder(input: CreateFolderInput): Promise<CreateFolderResult>
  uploadFiles(input: { path?: string; files: File[] }): Promise<UploadResult>
  getDownloadUrl(path: string): string
  renameFile(input: RenameInput): Promise<RenameResult>
  deleteFile(input: DeleteInput): Promise<DeleteResult>
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
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText })) as { error?: string }
      throw new Error(error.error || `Request failed: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  /* ======================== Files API ======================== */

  async listFiles(input: Partial<ListFilesInput> = {}): Promise<ListFilesResult> {
    const path = input.path || ""
    return this.request<ListFilesResult>(
      `/api/files?path=${encodeURIComponent(path)}`
    )
  }

  async createFolder(input: CreateFolderInput): Promise<CreateFolderResult> {
    return this.request<CreateFolderResult>(
      `/api/files/folder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
  }

  async uploadFiles(input: { path?: string; files: File[] }): Promise<UploadResult> {
    const formData = new FormData()
    if (input.path) formData.append("path", input.path)
    input.files.forEach((file) => formData.append("files", file))

    return this.request<UploadResult>(
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

  async renameFile(input: RenameInput): Promise<RenameResult> {
    return this.request<RenameResult>(
      `/api/files/rename`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
  }

  async deleteFile(input: DeleteInput): Promise<DeleteResult> {
    return this.request<DeleteResult>(
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
