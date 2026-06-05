/**
 * Centralized query keys for the files module per ADR 0018.
 *
 * Functions return `as const` tuples so partial-match invalidation works
 * correctly: `invalidateQueries({ queryKey: filesKeys.all })` invalidates
 * every list and search; `filesKeys.list(parentId)` targets a single folder.
 */

export const filesKeys = {
  all: ["files"] as const,
  lists: () => [...filesKeys.all, "list"] as const,
  list: (parentId: string | null) => [...filesKeys.lists(), parentId] as const,
  searches: () => [...filesKeys.all, "search"] as const,
  search: (q: string, type?: "file" | "folder") =>
    [...filesKeys.searches(), q, type ?? "all"] as const,
}
