import { entries, lookup } from "../db"

/**
 * HPK / pointer-record helpers (ADR 0028 §3.1, Gap 2 resolution).
 *
 * The `entries` container uses a hierarchical partition key
 * [/ownerId, /parentId, /id]. A point read therefore needs the *full* key,
 * but id-only operations (download / rename / move / delete) only receive an
 * `id`. To avoid a cross-partition scan on every such call we keep a `lookup`
 * container of pointer records keyed by /id:
 *
 *     { id, ownerId, parentId }
 *
 * Resolving an id is then a 1-RU point read on `lookup`, after which we can do
 * a 1-RU point read on `entries` with the reconstructed hierarchical key.
 */

export interface EntryPointer {
  id: string
  ownerId: string
  /** null for root-level entries. */
  parentId: string | null
}

/** The Cosmos partition-key value for an entry document. */
export function entryPartitionKey(p: EntryPointer): [string, string | null, string] {
  return [p.ownerId, p.parentId, p.id]
}

/**
 * Upsert the pointer record for an entry. Call this whenever an entry is
 * created or its partition key changes (i.e. on move, since parentId is part
 * of the key).
 */
export async function putPointer(p: EntryPointer): Promise<void> {
  await lookup.items.upsert({ id: p.id, ownerId: p.ownerId, parentId: p.parentId })
}

/** Delete the pointer record for an entry. Tolerates an already-absent record. */
export async function deletePointer(id: string): Promise<void> {
  await lookup.item(id, id).delete().catch(() => {})
}

/**
 * Resolve an entry id to its pointer via a point read on the `lookup`
 * container. Returns null if no pointer exists (unknown id, or a legacy entry
 * created before pointers existed — callers fall back to a scan in that case).
 */
export async function resolvePointer(id: string): Promise<EntryPointer | null> {
  const { resource } = await lookup.item(id, id).read()
  if (!resource) return null
  return { id: resource.id, ownerId: resource.ownerId, parentId: resource.parentId ?? null }
}

/**
 * Read an entry document by id using the pointer to build the hierarchical
 * partition key (1-RU point read). Falls back to a cross-partition query when
 * no pointer exists yet (legacy documents predating the lookup container), so
 * behaviour is correct during/after the backfill window.
 */
export async function readEntryById(id: string): Promise<any | null> {
  const pointer = await resolvePointer(id)
  if (pointer) {
    const { resource } = await entries.item(id, entryPartitionKey(pointer)).read()
    if (resource) return resource
    // Pointer was stale (entry gone); fall through to the scan as a safety net.
  }
  const { resources } = await entries.items
    .query({
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll()
  return resources[0] ?? null
}
