import * as z from "zod";

/* ======================== Entities ======================== */

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string().email(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const VaultEntrySchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid().nullable(),
  parentId: z.string().nullable(),
  name: z.string(),
  type: z.enum(["file", "folder"]),
  size: z.number(),
  contentType: z.string().nullable(),
  blobUrl: z.string().nullable(),
  isFavorite: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

export type VaultEntry = z.infer<typeof VaultEntrySchema>;

/* ======================== Request schemas ======================== */

export const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});
export type RegisterInput = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof LoginBody>;

export const ListFilesQuery = z.object({
  entityId: z.uuid().nullable().optional(),
});
export type ListFilesInput = z.infer<typeof ListFilesQuery>;

export const CreateFolderBody = z.object({
  parentId: z.uuid().nullable().optional(),
  name: z.string().min(1).max(255),
});
export type CreateFolderInput = z.infer<typeof CreateFolderBody>;

export const RenameBody = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});
export type RenameInput = z.infer<typeof RenameBody>;

export const MoveBody = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable().optional(),
});
export type MoveInput = z.infer<typeof MoveBody>;

export const DeleteBody = z.object({
  id: z.uuid(),
});
export type DeleteInput = z.infer<typeof DeleteBody>;

/* ======================== Response schemas ======================== */

export const ListFilesResponse = z.object({
  entityId: z.string().nullable(),
  entries: z.array(VaultEntrySchema),
});
export type ListFilesResult = z.infer<typeof ListFilesResponse>;

export const CreateFolderResponse = z.object({
  id: z.string().uuid(),
  parentId: z.string().nullable(),
  type: z.literal("folder"),
});
export type CreateFolderResult = z.infer<typeof CreateFolderResponse>;

export const UploadResponse = z.object({
  uploaded: z.array(VaultEntrySchema),
});
export type UploadResult = z.infer<typeof UploadResponse>;

export const RenameResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type RenameResult = z.infer<typeof RenameResponse>;

export const MoveResponse = z.object({
  id: z.string().uuid(),
  parentId: z.string().nullable(),
});
export type MoveResult = z.infer<typeof MoveResponse>;

export const DeleteResponse = z.object({
  deleted: z.number(),
});
export type DeleteResult = z.infer<typeof DeleteResponse>;

export const QuickLinksResponse = z.object({
  starred: z.number(),
  recent: z.number(),
  tags: z.number(),
  trash: z.number(),
});
export type QuickLinksResult = z.infer<typeof QuickLinksResponse>;

export const AuthResponse = z.object({
  user: UserSchema,
});
export type AuthResult = z.infer<typeof AuthResponse>;

/* ======================== Client ======================== */

export interface VaultStore {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  logout(): Promise<void>;
  me(): Promise<AuthResult>;
  listFiles(input?: Partial<ListFilesInput>): Promise<ListFilesResult>;
  createFolder(input: CreateFolderInput): Promise<CreateFolderResult>;
  uploadFiles(input: { parentId?: string; files: File[] }): Promise<UploadResult>;
  getDownloadUrl(id: string): string;
  renameFile(input: RenameInput): Promise<RenameResult>;
  moveFile(input: MoveInput): Promise<MoveResult>;
  deleteFile(input: DeleteInput): Promise<DeleteResult>;
  getQuickLinks(): Promise<QuickLinksResult>;
}

export class VaultClient implements VaultStore {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({ error: response.statusText }))) as { error?: string };
      throw new Error(error.error || `Request failed: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /* ======================== Auth API ======================== */

  async register(input: RegisterInput): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async login(input: LoginInput): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async logout(): Promise<void> {
    await this.request<void>("/api/auth/logout", { method: "POST" });
  }

  async me(): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/me");
  }

  /* ======================== Files API ======================== */

  async listFiles(
    input: Partial<ListFilesInput> = {},
  ): Promise<ListFilesResult> {
    const entityId = input.entityId ?? "";
    const params = entityId ? `?entityId=${encodeURIComponent(entityId)}` : "";
    return this.request<ListFilesResult>(`/api/files${params}`);
  }

  async createFolder(input: CreateFolderInput): Promise<CreateFolderResult> {
    return this.request<CreateFolderResult>(`/api/files/folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async uploadFiles(input: {
    parentId?: string;
    files: File[];
  }): Promise<UploadResult> {
    const formData = new FormData();
    if (input.parentId) formData.append("parentId", input.parentId);
    input.files.forEach((file) => formData.append("files", file));

    return this.request<UploadResult>(`/api/files/upload`, {
      method: "POST",
      body: formData,
    });
  }

  getDownloadUrl(id: string): string {
    return `${this.baseUrl}/api/files/download?id=${encodeURIComponent(id)}`;
  }

  async renameFile(input: RenameInput): Promise<RenameResult> {
    return this.request<RenameResult>(`/api/files/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async moveFile(input: MoveInput): Promise<MoveResult> {
    return this.request<MoveResult>(`/api/files/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async deleteFile(input: DeleteInput): Promise<DeleteResult> {
    return this.request<DeleteResult>(`/api/files`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async getQuickLinks(): Promise<QuickLinksResult> {
    return this.request<QuickLinksResult>(`/api/files/quick-links`);
  }
}

/* ======================== Factory ======================== */

export function createVaultClient(baseUrl: string): VaultClient {
  return new VaultClient(baseUrl);
}
