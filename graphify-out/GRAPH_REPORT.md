# Graph Report - .  (2026-05-17)

## Corpus Check
- Corpus is ~7,073 words - fits in a single context window. You may not need a graph.

## Summary
- 55 nodes · 51 edges · 5 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_VaultClient SDK|VaultClient SDK]]
- [[_COMMUNITY_AzureBlobStore|AzureBlobStore]]
- [[_COMMUNITY_Path Utilities|Path Utilities]]
- [[_COMMUNITY_Azure Service Client|Azure Service Client]]
- [[_COMMUNITY_Vue Composables|Vue Composables]]

## God Nodes (most connected - your core abstractions)
1. `AzureBlobStore` - 10 edges
2. `VaultClient` - 9 edges
3. `normalizePath()` - 3 edges
4. `toPrefix()` - 3 edges
5. `getBlobStore()` - 3 edges
6. `useAsync()` - 3 edges
7. `joinName()` - 2 edges
8. `isSafeName()` - 2 edges
9. `getContainer()` - 2 edges
10. `isConfigured()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `useFiles()` --calls--> `useAsync()`  [INFERRED]
  app/composables/useFiles.ts → app/composables/useAsync.ts

## Communities (17 total, 3 thin omitted)

### Community 2 - "Path Utilities"
Cohesion: 0.6
Nodes (4): isSafeName(), joinName(), normalizePath(), toPrefix()

### Community 3 - "Azure Service Client"
Cohesion: 0.4
Nodes (3): getBlobStore(), getContainer(), isConfigured()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AzureBlobStore` connect `AzureBlobStore` to `Azure Service Client`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `getBlobStore()` connect `Azure Service Client` to `Path Utilities`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._