# ADR 0009: Sidebar Structure - Recent, Pinned, and Folders

**Status:** Proposed
**Date:** 2026-05-18

## Context

The current sidebar has hardcoded folders (Movies, Pictures, Documents) and quick links (Starred, Recent, Tags, Trash). We want to implement a dynamic sidebar with proper metadata storage.

The sidebar should have three main sections:
1. **Recent**: Displays blobs sorted by Last-Modified system metadata property
2. **Pinned/Starred**: A section for frequently accessed files
3. **Folders**: User's folder structure (top-level folders from Azure)

**Metadata storage:** Recent and Pinned/Starred data should be stored in the PostgreSQL database from ADR 0007, not in Azure Blob Storage.

## Decision

**Sidebar Structure:**
1. **Recent Section** (collapsible, collapsed by default)
   - Displays files sorted by `modifiedAt` timestamp
   - Max-height with scroll if many items
   - Metadata stored in database `vault_entries.modifiedAt`

2. **Pinned/Starred Section** (collapsible, collapsed by default)
   - Displays frequently accessed files
   - Max-height with scroll if many items
   - Metadata stored in database via `pinned` field in `vault_entries`

3. **Folders Section** (collapsible, collapsed by default)
   - Top-level folders from Azure blob prefixes
   - Max-height with scroll if many folders
   - Virtual scrolling for performance with many folders

**All sections:**
- Collapsed by default
- Max-height with proper overflow scrolling
- Consistent font styling
- Stored in PostgreSQL for metadata, Azure for actual file storage

## Database Schema Updates

Add metadata fields to `vault_entries` table:

```sql
ALTER TABLE vault_entries ADD COLUMN pinned TEXT DEFAULT '0';
-- '1' for pinned/starred, '0' otherwise
```

The `modifiedAt` field already exists for recent sorting.

## API Endpoints

**Recent Files:**
```typescript
GET /api/files/recent?limit=20
Response: {
  recent: [
    { id, name, path, type, size, modifiedAt },
    ...
  ]
}
```

**Pinned Files:**
```typescript
GET /api/files/pinned
Response: {
  pinned: [
    { id, name, path, type, size, modifiedAt },
    ...
  ]
}
```

**Toggle Pin:**
```typescript
POST /api/files/:id/pin
Body: { pinned: boolean }
```

**Top-Level Folders:**
```typescript
GET /api/folders
Response: {
  folders: [
    { name, path },
    ...
  ]
}
```

## Frontend Implementation

**Sidebar Component Structure:**
```vue
<template>
  <aside>
    <!-- Recent Section -->
    <CollapsibleSection
      title="Recent"
      :collapsed="true"
      max-height="300px"
    >
      <RecentFileList :files="recentFiles" />
    </CollapsibleSection>

    <!-- Pinned Section -->
    <CollapsibleSection
      title="Pinned"
      :collapsed="true"
      max-height="300px"
    >
      <PinnedFileList :files="pinnedFiles" />
    </CollapsibleSection>

    <!-- Folders Section -->
    <CollapsibleSection
      title="Folders"
      :collapsed="true"
      max-height="400px"
    >
      <VirtualFolderList :folders="folders" />
    </CollapsibleSection>
  </aside>
</template>
```

**Collapsible Section Component:**
```vue
<script setup lang="ts">
const collapsed = ref(true)
</script>

<template>
  <div class="section">
    <button @click="collapsed = !collapsed" class="section-header">
      <ChevronRight :class="{ 'rotate-90': !collapsed }" />
      <h3>{{ title }}</h3>
    </button>
    <div
      v-show="!collapsed"
      class="section-content"
      :style="{ maxHeight: maxHeight }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted-foreground);
}

.section-content {
  overflow-y: auto;
  padding: 0 12px;
}
</style>
```

## Implementation Plan

### Phase 1: Database Schema
1. Add `pinned` column to `vault_entries` table
2. Update `db.ts` init SQL to include new column
3. Update `schema.ts` Drizzle schema

### Phase 2: API Endpoints
1. Create `GET /api/files/recent` endpoint
2. Create `GET /api/files/pinned` endpoint
3. Create `POST /api/files/:id/pin` endpoint
4. Create `GET /api/folders` endpoint (Azure blob prefix listing)

### Phase 3: Frontend Components
1. Create `CollapsibleSection.vue` component
2. Create `RecentFileList.vue` component
3. Create `PinnedFileList.vue` component
4. Update `FolderList.vue` with virtual scrolling
5. Update `AppSidebar.vue` to use new sections

### Phase 4: Integration
1. Wire up API calls in sidebar
2. Implement collapse/expand state
3. Add loading states
4. Add error handling

## Consequences

### Positive

- Clean separation of concerns (metadata in DB, files in Azure)
- Fast queries via database indexes
- Rich metadata capabilities (pinned, recent, future tags)
- Consistent UI pattern across all sections
- Scalable to thousands of folders via virtual scrolling

### Negative

- Two systems to manage (PostgreSQL + Azure)
- Must keep database and storage in sync
- More complex than simple Azure-only approach

### Neutral

- Aligns with ADR 0007's database foundation
- Enables future features (tags, trash, sharing) via database metadata

## References

- [ADR 0007](0007-auth-and-identity-migration.md) - Database foundation
- [ADR 0008](0008-id-based-urls-with-human-readable-blobs.md) - UUID-based approach
