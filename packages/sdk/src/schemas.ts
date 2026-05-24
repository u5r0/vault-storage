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

export const ResetPasswordBody = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordBody>;

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

export interface VaultStore {
  register(input: RegisterInput): Promise<AckResult>;
  resendVerification(input: ResendVerificationInput): Promise<AckResult>;
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
