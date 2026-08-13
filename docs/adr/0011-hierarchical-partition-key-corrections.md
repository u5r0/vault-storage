# ADR 0011: Hierarchical Partition Key Corrections

**Status:** Accepted
**Date:** 2026-08-13
**Corrects:** ADR 0028 §3.1 in `build-reasoning` (its HPK query guidance and the "verify null as an HPK segment" open item)
**Amends:** ADR 0006 (as amended by ADR 0010 — three-container model)
**Related:** ADR 0010 (Phase 1 HPK verification)

---

## Context

ADR 0028 §3.1 (in the `build-reasoning` repo) designed the `vault_entries`
container around a hierarchical partition key `[/ownerId, /parentId, /id]`.
Two parts of that design were wrong or unverified, and both surface only against
real Azure Cosmos DB — never the emulator — so they slipped through local dev
and CI.

1. **`list()` was told to pass a partial key.** §3.1 point 2 prescribed
   scoping the folder listing with `partitionKey: ["ownerId", parentId]` — a
   2-element prefix on a 3-level key. Cosmos rejects a partial key passed via
   the `partitionKey` option (it only accepts the *full* key), returning
   `400 substatus 1001 — Partition key provided either doesn't correspond to
   definition in the collection`. This is the production `GET /api/files` 500.

2. **`null` as an HPK segment was assumed, never verified.** §3.1 point 1
   explicitly flagged it ("confirm the SDK/emulator accept `null` as a valid
   HPK segment — not assumed") but it was never confirmed. Root entries were
   written with `parentId: null`, so their full key became `[ownerId, null, id]`
   and every root-listing query compared `c.parentId = null` — which in Cosmos
   SQL never matches (`= null` yields `undefined`, so root would render empty
   even with correct routing).

3. **The "global" phase was half-implemented.** §3.1 point 2 wanted `list()`
   to merge two phases (own + `ownerId = null` "global"). The code dropped the
   global phase but left misleading comments, and `search`/`listAll`/
   `quickLinks` still carried the dead `OR c.ownerId = null` branch.

## Decision

### 1. Sentinel for the root parent, not `null`

Root-level entries store `parentId = "__root__"` at rest. The public API keeps
`parentId: null` meaning "root" — the mapping happens at the storage boundary:

- `resolveParentId(parentId: string | null): string` maps `null → "__root__"`
  on writes and when building a partition key.
- `toApiParentId(parentId: string | null): string | null` maps `"__root__" →
  null` when building a `VaultEntry` response.

This removes `null` from every HPK segment *and* from every `= null` query
predicate in one move. Point reads and writes on root entries now always use a
non-null key `[ownerId, "__root__", id]`.

### 2. Route `list()` via the WHERE clause, never a partial `partitionKey`

Per Microsoft's HPK docs, prefix routing is achieved by putting the leading
partition-key values in the `WHERE` clause — not by passing them to the
`partitionKey` query option. `list()` therefore:

- drops the `partitionKey` option entirely, and
- adds `c.ownerId = @ownerId AND c.parentId = @parentId` to the `WHERE` clause.

### 3. Own-only read paths; global files deferred

`list()`, `search()`, `listAll()`, and `quickLinks()` scope to the caller's
documents only (`c.ownerId = @ownerId`). The ADR 0028 "global" (`ownerId =
null`) phase is dropped: no write path produces a global entry today, so the
phase would always be empty. If global files become a real feature later, they
should get an explicit `ownerId` sentinel (mirroring `__root__`), never `null`.

## Consequences

**Positive:**
- `GET /api/files` works against real Cosmos DB (fixes the `400 substatus 1001`).
- Root-level point reads/writes/moves no longer depend on Cosmos accepting
  `null` as an HPK segment.
- The `= null` SQL gotcha is eliminated from the read paths that used it.

**Negative:**
- Root parent is now `"__root__"` at rest rather than `null` — a schema note for
  anyone inspecting raw Cosmos documents.
- Own-only semantics mean global/shared files are not yet representable; they
  were never written anyway.

**Migration:** none — there is zero production data (ADR 0028 §3.1 "why this
ships now"), so no backfill or dual-write is required. Local/CI emulators
recreate containers per run.

---

## References

- `build-reasoning` ADR 0028 §3.1 — original HPK design (superseded by this ADR on the two points above).
- `build-reasoning` ADR 0028 §3.1 point 1 — the "verify null as an HPK segment" open item, now resolved.
- Microsoft Learn: [Hierarchical Partition Keys](https://learn.microsoft.com/en-us/azure/cosmos-db/hierarchical-partition-keys) — prefix queries route via the `WHERE` clause; the `partitionKey` option takes the full key.
- ADR 0010 — Phase 1 HPK implementation status and handoff.
