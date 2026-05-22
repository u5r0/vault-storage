<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  ClipboardList,
  Tag,
  Star,
  Trash2,
  ArrowUpDown,
  LayoutGrid,
  List,
  Home,
  Upload,
  MousePointerClick,
} from "@lucide/vue"
import type { VaultEntry } from "@vault/sdk"
import { typeLabel } from "@/lib/format"
import { useFilesStore } from "@/stores/files"
import { useUploadStore } from "@/stores/upload"
import UploadQueue from "@/modules/upload/components/UploadQueue.vue"
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

const filesStore  = useFilesStore()
const uploadStore = useUploadStore()

// Keep the upload store's parentId in sync with the active route.
watch(
  () => props.currentEntityId,
  (id) => uploadStore.setCurrentEntity(id || null),
  { immediate: true },
)

// Refresh the route's listing when an upload batch completes.
watch(
  () => uploadStore.lastCompletedAt,
  (val, prev) => {
    if (val && val !== prev) emit("upload-complete")
  },
)

// ─── Full-background drop zone ───────────────────────────────────────
const isDraggingOver = ref(false)
let dragCounter = 0

const dropDisabled = computed(
  () => isRoot.value && !filesStore.allowRootUploads,
)

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter++
  if (e.dataTransfer?.types.includes("Files")) {
    isDraggingOver.value = true
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = dropDisabled.value ? "none" : "copy"
  }
}

function onDragLeave() {
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter = 0
  isDraggingOver.value = false
  if (dropDisabled.value) return
  const items = e.dataTransfer?.files
  if (!items?.length) return
  uploadStore.addFiles(
    Array.from(items).map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      data: file,
    })),
  )
}

// ─── Sorting & view ──────────────────────────────────────────────────
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

const isEmpty = computed(() => props.files.length === 0)
const isRoot  = computed(() => !props.currentEntityId)

const toolbarActions = [
  { id: "details", icon: ClipboardList, label: "Properties" },
  { id: "tags",    icon: Tag,           label: "Tags" },
  { id: "star",    icon: Star,          label: "Star" },
  { id: "trash",   icon: Trash2,        label: "Delete" },
]
</script>

<template>
  <section
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-border)]"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
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

    <!-- Drop hint — subtle persistent note -->
    <div
      class="pointer-events-none flex items-center justify-center gap-2 border-b border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/25 px-5 py-2 text-[11.5px] text-muted-foreground/70"
    >
      <MousePointerClick :size="12" :stroke-width="2" class="opacity-70" />
      <template v-if="dropDisabled">
        Root uploads disabled — open a folder to upload, or enable in Settings.
      </template>
      <template v-else>
        Drop files anywhere to upload
      </template>
    </div>

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
    </div>

    <!-- GRID VIEW -->
    <div v-else class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <FileEmptyState v-if="isEmpty" :is-root="isRoot" @create-folder="emit('create-folder')" />

      <ul v-else class="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-4">
        <li v-for="file in sorted" :key="file.id">
          <FileGridItem :file="file" :selected="selectedId === file.id" @select="emit('select', file.id)" />
        </li>
      </ul>
    </div>

    <!-- Active drag overlay -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDraggingOver"
        :class="[
          'pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed backdrop-blur-sm',
          dropDisabled
            ? 'border-[var(--color-muted-foreground)]/40 bg-[var(--color-background)]/80'
            : 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60',
        ]"
      >
        <span
          :class="[
            'grid h-14 w-14 place-items-center rounded-full',
            dropDisabled
              ? 'bg-[var(--color-muted)] text-muted-foreground'
              : 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
          ]"
        >
          <Upload :size="28" :stroke-width="1.75" />
        </span>
        <p
          :class="[
            'text-sm font-medium',
            dropDisabled ? 'text-muted-foreground' : 'text-[var(--color-primary)]',
          ]"
        >
          {{ dropDisabled ? "Open a folder to upload" : "Drop files to upload" }}
        </p>
        <p v-if="dropDisabled" class="max-w-xs text-center text-[11.5px] text-muted-foreground/80">
          Root uploads are disabled. Enable in Settings → Files, or pick a folder.
        </p>
      </div>
    </Transition>

    <!-- Upload queue — floating bar, visible whenever files are pending -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="uploadStore.hasPending && uploadStore.uppy"
        class="absolute inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-3 backdrop-blur"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-[11.5px] text-muted-foreground">
            {{ uploadStore.files.filter(f => !f.progress?.uploadComplete).length }} file(s) uploading
          </p>
        </div>
        <UploadQueue :uppy="uploadStore.uppy" :files="uploadStore.files" />
      </div>
    </Transition>
  </section>
</template>
