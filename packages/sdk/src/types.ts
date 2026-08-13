import type {
  AckResult,
  AllFilesResult,
  AuthResult,
  Config,
  CreateFolderInput,
  CreateFolderResult,
  DeleteInput,
  DeleteResult,
  DownloadUrlResult,
  ListFilesInput,
  ListFilesResult,
  LoginInput,
  MoveInput,
  MoveResult,
  QuickLinksResult,
  RegisterInput,
  RenameInput,
  RenameResult,
  ResendVerificationInput,
  SearchFilesInput,
  SearchFilesResult,
  Settings,
  UpdateSettings,
  UploadCompleteInput,
  UploadCompleteResult,
  UploadResult,
  UploadUrlInput,
  UploadUrlResult,
} from "./schemas.js";

/**
 * The store contract both `VaultClient` and test mocks implement. Kept
 * separate from the Zod DTOs in `schemas.ts` so the transport seam (client +
 * upload manager) is distinct from the wire contract.
 */
export interface VaultStore {
  getConfig(): Promise<Config>;
  getSettings(): Promise<Settings>;
  updateSettings(input: UpdateSettings): Promise<Settings>;
  register(input: RegisterInput): Promise<AckResult>;
  resendVerification(input: ResendVerificationInput): Promise<AckResult>;
  login(input: LoginInput): Promise<AuthResult>;
  logout(): Promise<void>;
  me(): Promise<AuthResult>;
  listFiles(input?: Partial<ListFilesInput>): Promise<ListFilesResult>;
  searchFiles(
    input: SearchFilesInput,
    init?: { signal?: AbortSignal },
  ): Promise<SearchFilesResult>;
  createFolder(input: CreateFolderInput): Promise<CreateFolderResult>;
  uploadFiles(input: { parentId?: string; files: File[] }): Promise<UploadResult>;
  /**
   * Browser-direct upload: bytes go straight to object storage via a
   * presigned URL, then the server records the entry. Same result shape
   * as `uploadFiles` so callers can switch paths transparently.
   */
  uploadFilesDirect(input: { parentId?: string; files: File[] }): Promise<UploadResult>;
  createUploadUrl(input: UploadUrlInput): Promise<UploadUrlResult>;
  completeUpload(input: UploadCompleteInput): Promise<UploadCompleteResult>;
  createDownloadUrl(id: string): Promise<DownloadUrlResult>;
  renameFile(input: RenameInput): Promise<RenameResult>;
  moveFile(input: MoveInput): Promise<MoveResult>;
  deleteFile(input: DeleteInput): Promise<DeleteResult>;
  getQuickLinks(): Promise<QuickLinksResult>;
  /** Flat index-hydration: returns all entries for the authed user, capped
   *  at 10 000. `truncated: true` means the vault is too large to index
   *  locally and server search should be used exclusively. */
  listAllEntries(): Promise<AllFilesResult>;
}
