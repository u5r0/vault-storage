/**
 * Helpers for normalizing virtual folder paths inside an Azure Blob
 * container. Azure has no real folders: hierarchy is encoded in blob
 * names by using "/" as a delimiter. We treat a path like "Movies/Action"
 * as a folder prefix "Movies/Action/" and a blob like
 * "Movies/Action/movie.mp4" as a file inside that folder.
 */

/** Normalize an external path to "a/b/c" (no leading/trailing slashes). */
export function normalizePath(input: string | undefined | null): string {
  if (!input) return ""
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean)
    .join("/")
}

/** Convert a normalized path into a folder prefix ("a/b/" or ""). */
export function toPrefix(path: string): string {
  const norm = normalizePath(path)
  return norm ? `${norm}/` : ""
}

/** Join a folder prefix and a name into a full blob name. */
export function joinName(prefix: string, name: string): string {
  const cleanName = name.replace(/^\/+|\/+$/g, "")
  return `${prefix}${cleanName}`
}

/** Reject names that contain path separators or control characters. */
export function isSafeName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name.includes("/") || name.includes("\\")) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false
  if (name === "." || name === "..") return false
  return true
}

/**
 * Marker blob used to materialize an otherwise-empty folder.
 * Listing logic filters these out so they never show up as files.
 */
export const FOLDER_KEEP = ".vault-keep"
