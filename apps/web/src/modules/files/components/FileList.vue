<script setup lang="ts">
import { computed, toRef } from "vue"
import {
  ClipboardList,
  Tag,
  Star,
  Trash2,
  ArrowUpDown,
  LayoutGrid,
  List,
  Home,
} from "@lucide/vue"
import type { VaultEntry } from "@vault/sdk"
import { typeLabel } from "@/lib/format"
import { useFilesStore } from "@/stores/files"
import { useVaultUpload } from "@/modules/upload/composables/useVaultUpload"
import UploadDropZone from "@/modules/upload/components/UploadDropZone.vue"
import UploadQueue from "@/modules/upload/components/UploadQueue.vue"
import UploadTrigger from "@/modules/upload/components/UploadTrigger.vue"
import FileListItem from "./FileListItem.vue"
import FileGridItem from "./FileGridItem.vue"
import FileEmptyState from "./FileEmptyState.vue"

const props = defineProps<{
  files: VaultEntry[]
  selectedId: string
  currentEntityId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  navigate: [entityId: string | null]
  "upload-complete": []
  "create-folder": []
}>()

const filesStore = useFilesStore()

const { uppy, files: uploadFiles, hasPending } = useVaultUpload({
  currentEntityId: toRef(props, "currentEntityId"),
  onUploadComplete: () => emit("upload-complete"),
})

const sorted = computed(() => {
  const list = [...props.files]
  list.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    let cmp = 0
    switch (filesStore.sortKey) {
      case "name":     cmp = a.name.localeCompare(b.name); break
      case "modified": cmp = (a.modifiedAt ?? "").localeCompare(b.modifiedAt ?? ""); break
      case "type":     cmp = typeLabel(a).localeCompare(typeLabel(b)); break
      case "size":     cmp = a.size - b.size; break
    }
    return filesStore.sortAsc ? cmp : -cmp
  })
  return list
})

const isEmpty  = computed(() => props.files.length === 0)
const isRoot   = computed(() => !props.currentEntityId)

const toolbarActions = [
  { id: "details", icon: ClipboardList, label: "Properties" },
  { id: "tags",    icon: Tag,           label: "Tags" },
  { id: "star",    icon: Star,          label: "Star" },
  { id: "trash",   icon: Trash2,        label: "Delete" },
]
</script>

<template>
  <section
    class="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-border)]"
  >
    <!-- Toolbar -->
    <div class="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
      <button
        type="button"
        @click="emit('navigate', null)"
        class="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] transition hover:opacity-80"
        aria-label="Root"
      >
        <Home :size="16" :stroke-width="2" />
      </button>

      <p class="text-[11.5px] text-muted-foreground">{{ props.files.length }} items</p>

      <div class="ml-auto flex items-center gap-1">
        <!-- View toggle -->
        <div
          class="mr-2 hidden items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 p-1 sm:flex"
        >
          <button
            type="button"
            aria-label="List view"
            @click="filesStore.setViewMode('list')"
            :class="[
              'grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] transition',
              filesStore.viewMode === 'list'
                ? 'bg-[var(--color-card)] text-foreground shadow-sm'
                : 'text-muted-foreground',
            ]"
          >
            <List :size="14" :stroke-width="2" />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            @click="filesStore.setViewMode('grid')"
            :class="[
              'grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] transition',
              filesStore.viewMode === 'grid'
                ? 'bg-[var(--color-card)] text-foreground shadow-sm'
                : 'text-muted-foreground',
            ]"
          >
            <LayoutGrid :size="14" :stroke-width="2" />
          </button>
        </div>

        <button
          v-for="action in toolbarActions"
          :key="action.id"
          type="button"
          :aria-label="action.label"
          :title="action.label"
          class="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-foreground"
        >
          <component :is="action.icon" :size="16" :stroke-width="1.75" />
        </button>
      </div>
    </div>

    <!-- Pending upload queue — removed from top, lives only at the bottom bar -->

    <!-- LIST VIEW -->
    <div v-if="filesStore.viewMode === 'list'" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        v-if="!isEmpty"
        class="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_180px_140px_100px] items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur"
      >
        <button type="button" @click="filesStore.setSortKey('name')" class="flex items-center gap-1.5 hover:text-foreground">
          Name
          <ArrowUpDown :size="11" :stroke-width="2" :class="filesStore.sortKey === 'name' ? 'text-foreground' : 'opacity-60'" />
        </button>
        <button type="button" @click="filesStore.setSortKey('modified')" class="flex items-center gap-1.5 hover:text-foreground">
          Last modified
          <ArrowUpDown :size="11" :stroke-width="2" :class="filesStore.sortKey === 'modified' ? 'text-foreground' : 'opacity-60'" />
        </button>
        <button type="button" @click="filesStore.setSortKey('type')" class="flex items-center gap-1.5 hover:text-foreground">
          Type
          <ArrowUpDown :size="11" :stroke-width="2" :class="filesStore.sortKey === 'type' ? 'text-foreground' : 'opacity-60'" />
        </button>
        <button type="button" @click="filesStore.setSortKey('size')" class="flex items-center justify-end gap-1.5 hover:text-foreground">
          Size
          <ArrowUpDown :size="11" :stroke-width="2" :class="filesStore.sortKey === 'size' ? 'text-foreground' : 'opacity-60'" />
        </button>
      </div>

      <FileEmptyState v-if="isEmpty" :is-root="isRoot" @create-folder="emit('create-folder')" />

      <ul v-else class="flex flex-col px-2 py-2">
        <li v-for="file in sorted" :key="file.id">
          <FileListItem :file="file" :selected="selectedId === file.id" @select="emit('select', file.id)" />
        </li>
      </ul>

      <div
        class="sticky bottom-0 mt-auto border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur"
      >
        <!-- Upload progress bar — shown while uploading -->
        <div v-if="hasPending" class="px-5 pt-3 pb-1">
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <p class="text-[11.5px] text-muted-foreground">
              {{ uploadFiles.filter(f => !f.progress?.uploadComplete).length }} file(s) queued
            </p>
          </div>
          <UploadQueue :uppy="uppy" :files="uploadFiles" />
        </div>
        <div class="flex items-center gap-3 px-5 py-3">
          <UploadDropZone :uppy="uppy" compact class="min-w-0 flex-1" />
          <UploadTrigger v-if="hasPending" :uppy="uppy" class="shrink-0" />
        </div>
      </div>
    </div>

    <!-- GRID VIEW -->
    <div v-else class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <FileEmptyState v-if="isEmpty" :is-root="isRoot" @create-folder="emit('create-folder')" />

      <ul v-else class="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-4">
        <li v-for="file in sorted" :key="file.id">
          <FileGridItem :file="file" :selected="selectedId === file.id" @select="emit('select', file.id)" />
        </li>
      </ul>

      <div
        class="sticky bottom-0 mt-auto border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur"
      >
        <!-- Upload progress bar — shown while uploading -->
        <div v-if="hasPending" class="px-5 pt-3 pb-1">
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <p class="text-[11.5px] text-muted-foreground">
              {{ uploadFiles.filter(f => !f.progress?.uploadComplete).length }} file(s) queued
            </p>
          </div>
          <UploadQueue :uppy="uppy" :files="uploadFiles" />
        </div>
        <div class="flex items-center gap-3 px-5 py-3">
          <UploadDropZone :uppy="uppy" compact class="min-w-0 flex-1" />
          <UploadTrigger v-if="hasPending" :uppy="uppy" class="shrink-0" />
        </div>
      </div>
    </div>
  </section>
</template>
