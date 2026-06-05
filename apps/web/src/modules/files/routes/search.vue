<script setup lang="ts">
import { computed, watch, useTemplateRef } from "vue"
import { useRouter } from "vue-router"
import { useVirtualizer } from "@tanstack/vue-virtual"
import { Search, FileQuestion } from "@lucide/vue"
import { useUIStore, type SearchType } from "@/stores/ui"
import { useSearch } from "../composables/useSearch"
import FileListItem from "../components/FileListItem.vue"

/**
 * Search results route per ADR 0018 §C.
 *
 * The query lives in the `ui` store (driven by AppHeader). This component
 * just renders results, paginates on scroll, and handles the navigate-on-pick
 * interaction.
 */

const ui     = useUIStore()
const router = useRouter()

const {
  query,
  entries,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error,
} = useSearch()

const scrollerRef = useTemplateRef<HTMLDivElement>("scrollerRef")

const SEARCH_ROW_HEIGHT = 52

const virtualizer = useVirtualizer(
  computed(() => ({
    count: entries.value.length,
    getScrollElement: () => scrollerRef.value,
    estimateSize: () => SEARCH_ROW_HEIGHT,
    overscan: 8,
  })),
)

watch(
  () => virtualizer.value.getVirtualItems(),
  (items) => {
    if (items.length === 0) return
    const last = items[items.length - 1].index
    if (hasNextPage.value && !isFetchingNextPage.value && last >= entries.value.length - 8) {
      fetchNextPage()
    }
  },
)

const filters: { id: SearchType; label: string }[] = [
  { id: undefined, label: "All" },
  { id: "file",    label: "Files" },
  { id: "folder",  label: "Folders" },
]

const tooShort = computed(() => query.value.trim().length < 2)
const noResults = computed(
  () => !tooShort.value && !isLoading.value && entries.value.length === 0,
)

function handlePick(id: string) {
  const entry = entries.value.find((e) => e.id === id)
  if (!entry) return
  if (entry.type === "folder") {
    router.push({ name: "content", params: { entityId: entry.id } })
  } else {
    router.push({
      name: "content",
      params: entry.parentId ? { entityId: entry.parentId } : {},
      query: { selected: entry.id },
    })
  }
}
</script>

<template>
  <main class="flex flex-1 flex-col overflow-hidden">
    <header class="border-b border-[var(--color-border)] px-5 py-4">
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Search :size="14" :stroke-width="2" />
        <span v-if="tooShort">Type at least 2 characters to search.</span>
        <span v-else>
          Results for <strong class="text-foreground">{{ query }}</strong>
        </span>
      </div>

      <div class="mt-3 flex items-center gap-1.5">
        <button
          v-for="filter in filters"
          :key="filter.label"
          type="button"
          @click="ui.setSearchType(filter.id)"
          :class="[
            'rounded-[var(--radius-sm)] border px-3 py-1 text-[12px] transition',
            ui.searchType === filter.id
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
              : 'border-[var(--color-border)] text-muted-foreground hover:bg-[var(--color-muted)]',
          ]"
        >
          {{ filter.label }}
        </button>
      </div>
    </header>

    <div v-if="error" class="grid flex-1 place-items-center text-destructive text-sm">
      {{ error.message }}
    </div>

    <div
      v-else-if="tooShort"
      class="grid flex-1 place-items-center px-5 text-center text-sm text-muted-foreground"
    >
      Start typing to search across your vault.
    </div>

    <div v-else-if="isLoading" class="grid flex-1 place-items-center text-muted-foreground text-sm">
      <v-spinner />
    </div>

    <div
      v-else-if="noResults"
      class="grid flex-1 place-items-center px-5 text-center"
    >
      <div class="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <FileQuestion :size="32" :stroke-width="1.5" class="opacity-60" />
        <p>No matches for <strong class="text-foreground">{{ query }}</strong>.</p>
      </div>
    </div>

    <div v-else ref="scrollerRef" class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <div
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }"
      >
        <div
          v-for="virtualRow in virtualizer.getVirtualItems()"
          :key="entries[virtualRow.index].id"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
          }"
          class="py-0.5"
        >
          <FileListItem
            :file="entries[virtualRow.index]"
            :selected="false"
            @select="handlePick"
          />
        </div>
      </div>
      <div
        v-if="isFetchingNextPage"
        class="grid place-items-center py-3 text-[11.5px] text-muted-foreground"
      >
        Loading more…
      </div>
    </div>
  </main>
</template>
