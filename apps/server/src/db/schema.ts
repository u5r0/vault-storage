import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  verified: text("verified").default("0"),
  verificationToken: text("verification_token"),
  verificationExpires: text("verification_expires"),
})

export const refreshTokens = sqliteTable("refresh_tokens", {
  jti: text("jti").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
})

// Vault entries store metadata for files and folders. `parent_id` references
// the parent folder for hierarchical organization; `blob_path` is the storage
// blob key where the file bytes are stored (e.g. "vault/blobs/<uuid>").
// `path` is retained as a computed field for API backward compatibility during migration.
export const vaultEntries = sqliteTable("vault_entries", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  path: text("path"), // Virtual path for API compatibility (computed from parentId hierarchy)
  type: text("type").notNull(),
  size: integer("size").default(0),
  contentType: text("content_type"),
  blobPath: text("blob_path"),
  blobName: text("blob_name"), // Alias for blobPath for backward compatibility
  createdAt: text("created_at").notNull(),
  modifiedAt: text("modified_at"),
})
