<script setup lang="ts">
import { computed, ref, toRef } from "vue"
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
import { UppyContextProvider, Dropzone, FilesList, UploadButton } from "@uppy/vue"
import "@uppy/vue/css/style.css"
import type { VaultEntry } from "@vault/sdk"
import { typeLabel } from "@/lib/format"
import { useVaultUpload } from "@/composables/useVaultUpload"
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

const view = ref<"list" | "grid">("list")
const sortKey = ref<"name" | "modified" | "type" | "size">("name")
const sortAsc = ref(true)

const { uppy, hasPending } = useVaultUpload({
  currentEntityId: toRef(props, "currentEntityId"),
  onUploadComplete: () => emit("upload-complete"),
})

function setSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

const sorted = computed(() => {
  const list = [...props.files]
  list.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    let cmp = 0
    switch (sortKey.value) {
      case "name": cmp = a.name.localeCompare(b.name); break
      case "modified": cmp = (a.modifiedAt ?? "").localeCompare(b.modifiedAt ?? ""); break
      case "type": cmp = typeLabel(a).localeCompare(typeLabel(b)); break
      case "size": cmp = a.size - b.size; break
    }
    return sortAsc.value ? cmp : -cmp
  })
  return list
})

const isEmpty = computed(() => props.files.length === 0)
const isRoot = computed(() => !props.currentEntityId)

const toolbarActions = [
  { id: "details", icon: ClipboardList, label: "Properties" },
  { id: "tags", icon: Tag, label: "Tags" },
  { id: "star", icon: Star, label: "Star" },
  { id: "trash", icon: Trash2, label: "Delete" },
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
        <div
          class="mr-2 hidden items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 p-1 sm:flex"
        >
          <button
            type="button"
            aria-label="List view"
            @click="view = 'list'"
            :class="[
              'grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] transition',
              view === 'list' ? 'bg-[var(--color-card)] text-foreground shadow-sm' : 'text-muted-foreground',
            ]"
          >
            <List :size="14" :stroke-width="2" />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            @click="view = 'grid'"
            :class="[
              'grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] transition',
              view === 'grid' ? 'bg-[var(--color-card)] text-foreground shadow-sm' : 'text-muted-foreground',
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

    <UppyContextProvider :uppy="uppy" class="flex min-h-0 flex-1 flex-col">
      <!-- Pending upload queue -->
      <div v-if="hasPending" class="border-b border-[var(--color-border)] px-5 py-3">
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="text-[12px] font-medium text-muted-foreground">Pending uploads</p>
          <UploadButton class="vault-uppy-upload" />
        </div>
        <div class="uppy-reset vault-uppy-queue">
          <FilesList :image-thumbnail="true" />
        </div>
      </div>

      <!-- LIST VIEW -->
      <div v-if="view === 'list'" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          v-if="!isEmpty"
          class="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_180px_140px_100px] items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur"
        >
          <button type="button" @click="setSort('name')" class="flex items-center gap-1.5 hover:text-foreground">
            Name
            <ArrowUpDown :size="11" :stroke-width="2" :class="sortKey === 'name' ? 'text-foreground' : 'opacity-60'" />
          </button>
          <button type="button" @click="setSort('modified')" class="flex items-center gap-1.5 hover:text-foreground">
            Last modified
            <ArrowUpDown :size="11" :stroke-width="2" :class="sortKey === 'modified' ? 'text-foreground' : 'opacity-60'" />
          </button>
          <button type="button" @click="setSort('type')" class="flex items-center gap-1.5 hover:text-foreground">
            Type
            <ArrowUpDown :size="11" :stroke-width="2" :class="sortKey === 'type' ? 'text-foreground' : 'opacity-60'" />
          </button>
          <button type="button" @click="setSort('size')" class="flex items-center justify-end gap-1.5 hover:text-foreground">
            Size
            <ArrowUpDown :size="11" :stroke-width="2" :class="sortKey === 'size' ? 'text-foreground' : 'opacity-60'" />
          </button>
        </div>

        <FileEmptyState
          v-if="isEmpty"
          :is-root="isRoot"
          @create-folder="emit('create-folder')"
        />

        <ul v-else class="flex flex-col px-2 py-2">
          <li v-for="file in sorted" :key="file.id">
            <FileListItem
              :file="file"
              :selected="selectedId === file.id"
              @select="emit('select', file.id)"
            />
          </li>
        </ul>

        <div
          v-if="!isEmpty && !isRoot"
          class="sticky bottom-0 mt-auto border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-3 backdrop-blur"
        >
          <div class="vault-uppy flex items-center gap-3">
            <Dropzone note="" class="vault-uppy-dropzone-compact min-w-0 flex-1" />
            <UploadButton v-if="hasPending" class="vault-uppy-upload shrink-0" />
          </div>
        </div>
      </div>

      <!-- GRID VIEW -->
      <div v-else class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <FileEmptyState
          v-if="isEmpty"
          :is-root="isRoot"
          @create-folder="emit('create-folder')"
        />

        <ul v-else class="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-4">
          <li v-for="file in sorted" :key="file.id">
            <FileGridItem
              :file="file"
              :selected="selectedId === file.id"
              @select="emit('select', file.id)"
            />
          </li>
        </ul>

        <div
          v-if="!isEmpty && !isRoot"
          class="sticky bottom-0 mt-auto border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-3 backdrop-blur"
        >
          <div class="vault-uppy flex items-center gap-3">
            <Dropzone note="" class="vault-uppy-dropzone-compact min-w-0 flex-1" />
            <UploadButton v-if="hasPending" class="vault-uppy-upload shrink-0" />
          </div>
        </div>
      </div>
    </UppyContextProvider>
  </section>
</template>

<style scoped>
.vault-uppy-dropzone :deep([data-uppy-element="dropzone"]) {
  min-height: 9rem;
  border-radius: var(--radius-md);
  border: 1px dashed color-mix(in oklch, var(--color-primary) 35%, var(--color-border));
  background: color-mix(in oklch, var(--color-primary-soft) 45%, transparent);
  color: var(--color-foreground);
  font-size: 13px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.vault-uppy-dropzone :deep([data-uppy-element="dropzone"]:hover) {
  border-color: color-mix(in oklch, var(--color-primary) 55%, var(--color-border));
  background: color-mix(in oklch, var(--color-primary-soft) 65%, transparent);
}

.vault-uppy-dropzone-compact :deep([data-uppy-element="dropzone"]) {
  min-height: 2.75rem;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border);
  background: color-mix(in oklch, var(--color-muted) 55%, transparent);
  color: var(--color-muted-foreground);
  font-size: 12.5px;
}

.vault-uppy-upload :deep(button[data-uppy-element="upload-button"]) {
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  font-size: 12.5px;
  font-weight: 500;
  padding: 0.45rem 0.875rem;
  box-shadow: 0 8px 24px -12px color-mix(in oklch, var(--color-primary) 60%, transparent);
  transition: opacity 0.15s ease;
}

.vault-uppy-upload :deep(button[data-uppy-element="upload-button"]:hover) {
  opacity: 0.92;
}

.vault-uppy-upload :deep(button[data-uppy-element="upload-button"][data-state="uploading"]) {
  opacity: 0.85;
  cursor: wait;
}

.vault-uppy-queue :deep(li) {
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-card);
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.375rem;
}

.vault-uppy-queue :deep(li:last-child) {
  margin-bottom: 0;
}

.vault-uppy-queue :deep(p) {
  font-size: 13px;
  color: var(--color-foreground);
}

.vault-uppy-queue :deep(button) {
  font-size: 11.5px;
  color: var(--color-muted-foreground);
  border-radius: var(--radius-xs);
  padding: 0.125rem 0.375rem;
}

.vault-uppy-queue :deep(button:hover) {
  color: var(--color-destructive);
  background: color-mix(in oklch, var(--color-destructive) 10%, transparent);
}
</style>
