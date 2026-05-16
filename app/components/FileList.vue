<script setup lang="ts">
import { computed, ref } from "vue"
import {
  ClipboardList,
  Tag,
  Star,
  Trash2,
  ArrowUpDown,
  LayoutGrid,
  List,
  FolderOpen,
} from "lucide-vue-next"
import FileIcon from "./FileIcon.vue"
import type { VaultEntry } from "@vault/sdk"
import { formatSize, formatDate, typeLabel } from "@/lib/format"

const props = defineProps<{
  files: VaultEntry[]
  selectedPath: string
  loading?: boolean
  error?: Error | null
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const view = ref<"list" | "grid">("list")
const sortKey = ref<"name" | "modified" | "type" | "size">("name")
const sortAsc = ref(true)

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

const toolbarActions = [
  { id: "details", icon: ClipboardList, label: "Properties" },
  { id: "tags", icon: Tag, label: "Tags" },
  { id: "star", icon: Star, label: "Star" },
  { id: "trash", icon: Trash2, label: "Delete" },
]

const showEmptyState = computed(() => {
  return !props.loading && !props.error && props.files.length === 0
})

const showLoadingState = computed(() => {
  return props.loading && props.files.length === 0
})
</script>

<template>
  <section
    class="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-border)]"
  >
    <!-- Toolbar -->
    <div class="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
      <span
        class="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        aria-hidden="true"
      >
        <FolderOpen :size="16" :stroke-width="2" />
      </span>
      <div class="min-w-0">
        <h1 class="truncate text-[15px] font-semibold tracking-tight">
          {{ showEmptyState ? "Empty folder" : "Files" }}
        </h1>
        <p class="text-[11.5px] text-muted-foreground">{{ props.files.length }} items</p>
      </div>

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

    <!-- LIST VIEW -->
    <div v-if="view === 'list'" class="flex-1 overflow-y-auto">
      <div
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

      <!-- Loading State -->
      <div v-if="showLoadingState" class="grid place-items-center py-16 text-sm text-muted-foreground">
        Loading…
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center gap-3 px-5 py-16">
        <div class="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{{ error.message }}</span>
        </div>
      </div>

      <!-- File List -->
      <ul v-else class="flex flex-col px-2 py-2">
        <li v-for="file in sorted" :key="file.path">
          <button
            type="button"
            @click="emit('select', file.path)"
            :class="[
              'grid w-full grid-cols-[minmax(0,1fr)_180px_140px_100px] items-center gap-4 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13.5px] transition',
              selectedPath === file.path
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-primary)_20%,transparent)]'
                : 'hover:bg-[var(--color-muted)]',
            ]"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                :class="[
                  'grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)]',
                  selectedPath === file.path
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'bg-[var(--color-muted)] text-muted-foreground',
                ]"
              >
                <FileIcon
                  :type="file.type"
                  :tone="selectedPath === file.path ? 'primary' : 'muted'"
                  :size="16"
                />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ file.name }}</span>
              </span>
            </div>
            <span class="truncate text-muted-foreground">{{ formatDate(file.modifiedAt) }}</span>
            <span class="truncate">{{ typeLabel(file) }}</span>
            <span class="text-right tabular-nums text-foreground/85">{{ formatSize(file.size) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- GRID VIEW -->
    <div v-else class="flex-1 overflow-y-auto p-5">
      <!-- Loading State -->
      <div v-if="showLoadingState" class="grid place-items-center py-16 text-sm text-muted-foreground">
        Loading…
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center gap-3 py-16">
        <div class="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{{ error.message }}</span>
        </div>
      </div>

      <!-- File Grid -->
      <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <li v-for="file in sorted" :key="file.path">
          <button
            type="button"
            @click="emit('select', file.path)"
            :class="[
              'group flex h-full w-full flex-col items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition',
              selectedPath === file.path
                ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]'
                : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--color-primary)_25%,transparent)]',
            ]"
          >
            <span
              :class="[
                'grid h-10 w-10 place-items-center rounded-[var(--radius-sm)]',
                selectedPath === file.path
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'bg-[var(--color-muted)] text-muted-foreground group-hover:text-foreground',
              ]"
            >
              <FileIcon :type="file.type" :size="20" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-[13.5px] font-medium">{{ file.name }}</p>
              <p class="truncate text-[11.5px] text-muted-foreground">
                {{ typeLabel(file) }} · {{ formatSize(file.size) }}
              </p>
            </div>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
