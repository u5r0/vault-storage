import * as z from "zod";

/* ======================== Entities ======================== */

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  verified: z.boolean(),
  lockedUntil: z.string().nullable(),
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

/**
 * Password rules per ADR 0002 (length-first + minimal composition):
 * - ≥ 12 characters
 * - at least one letter (A–Z or a–z)
 * - at least one digit (0–9)
 * Same schema reused server-side (zValidator) and client-side (form validation).
 */
const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(100, "Password must be at most 100 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a digit");

export const RegisterBody = z.object({
  email: z.email(),
  password: passwordSchema,
  name: z.string().min(1).max(80).optional(),
});
export type RegisterInput = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: z.email(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof LoginBody>;

export const ResendVerificationBody = z.object({ email: z.email() });
export type ResendVerificationInput = z.infer<typeof ResendVerificationBody>;

export const ForgotPasswordBody = z.object({ email: z.email() });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordBody>;
 
export const MagicLinkBody = z.object({ email: z.email() });
export type MagicLinkInput = z.infer<typeof MagicLinkBody>;

export const ResetPasswordBody = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordBody>;

export const ListFilesQuery = z.object({
  entityId: z.uuid().nullable().optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListFilesInput = z.infer<typeof ListFilesQuery>;

export const SearchFilesQuery = z.object({
  q: z.string().min(1).max(128),
  type: z.enum(["file", "folder"]).optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type SearchFilesInput = z.infer<typeof SearchFilesQuery>;

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

/* ── Direct upload (presigned PUT) ─────────────────────────────────────────
 * Two-step browser → object-store upload that keeps bytes off the API server.
 *
 *   1. POST /api/files/upload-url    → server mints a presigned PUT URL
 *                                      bound to a server-chosen blob key.
 *   2. (browser) PUT bytes to that URL.
 *   3. POST /api/files/upload-complete → server HEADs the blob, validates the
 *                                        actual size, and creates the entry.
 *
 * Replaces the single-step `/sas` flow described in ADR 0006, which assumed
 * the object store was the source of truth for file listings. With Cosmos
 * as the source of truth (entries keyed by UUID), a separate complete step
 * is required to record the entry. See `services/files.ts`.
 */
export const UploadUrlBody = z.object({
  parentId: z.uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  /** Client-declared size in bytes — checked again post-upload via stat(). */
  size: z.number().int().nonnegative(),
});
export type UploadUrlInput = z.infer<typeof UploadUrlBody>;

export const UploadUrlResponse = z.object({
  /** Server-generated blob key (also the future entry id). Echoed on complete. */
  blobName: z.string(),
  uploadUrl: z.url(),
  /** ISO 8601 timestamp; the URL is rejected after this. */
  expiresAt: z.string(),
  /**
   * Headers the browser must include on the PUT. Azure requires
   * `x-ms-blob-type: BlockBlob`; R2/S3 returns this empty.
   */
  requiredHeaders: z.record(z.string(), z.string()).default({}),
});
export type UploadUrlResult = z.infer<typeof UploadUrlResponse>;

export const UploadCompleteBody = z.object({
  blobName: z.string().min(1),
  parentId: z.uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  /** Optional override; server uses stat() if omitted or to validate. */
  contentType: z.string().min(1).max(200).optional(),
});
export type UploadCompleteInput = z.infer<typeof UploadCompleteBody>;

export const UploadCompleteResponse = z.object({
  entry: VaultEntrySchema,
});
export type UploadCompleteResult = z.infer<typeof UploadCompleteResponse>;

/* ── Direct download (presigned GET) ───────────────────────────────────── */
export const DownloadUrlQuery = z.object({
  id: z.uuid(),
});
export type DownloadUrlInput = z.infer<typeof DownloadUrlQuery>;

export const DownloadUrlResponse = z.object({
  url: z.url(),
  expiresAt: z.string(),
});
export type DownloadUrlResult = z.infer<typeof DownloadUrlResponse>;

/* ======================== Response schemas ======================== */

export const ListFilesResponse = z.object({
  entityId: z.string().nullable(),
  entries: z.array(VaultEntrySchema),
  cursor: z.string().nullable(),
});
export type ListFilesResult = z.infer<typeof ListFilesResponse>;

export const SearchFilesResponse = z.object({
  entries: z.array(VaultEntrySchema),
  cursor: z.string().nullable(),
});
export type SearchFilesResult = z.infer<typeof SearchFilesResponse>;

// Flat index-hydration endpoint: returns all of the authed user's entries in
// one response, capped at INDEX_HARD_LIMIT (10 000). `truncated: true` means
// the vault is too large to index locally and the client should use server
// search exclusively.
export const AllFilesResponse = z.object({
  entries: z.array(VaultEntrySchema),
  truncated: z.boolean(),
});
export type AllFilesResult = z.infer<typeof AllFilesResponse>;

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

/**
 * Privacy-preserving response for register/resend-verification per ADR 0019.
 * Returns the same shape regardless of whether the email is new, registered,
 * verified, or unverified — never echoes user existence.
 */
export const AckResponse = z.object({
  ok: z.literal(true),
  message: z.string(),
});
export type AckResult = z.infer<typeof AckResponse>;

/* ======================== Store contract ======================== */

export const ConfigResponse = z.object({
  maxUploadMb: z.number(),
});
export type Config = z.infer<typeof ConfigResponse>;

export const SettingsResponse = z.object({
  maxUploadMb: z.number().nullable(),
});
export type Settings = z.infer<typeof SettingsResponse>;

export const UpdateSettingsInput = z.object({
  maxUploadMb: z.number().nullable(),
});
export type UpdateSettings = z.infer<typeof UpdateSettingsInput>;
