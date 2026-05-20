<script setup lang="ts">
import type { VaultEntry } from "@vault/sdk"
import FileIcon from "./FileIcon.vue"
import { formatSize, formatDate, typeLabel, fileIconType } from "@/lib/format"

const props = defineProps<{
  file: VaultEntry
  selected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <button
    type="button"
    @click="emit('select', file.id)"
    :class="[
      'grid w-full grid-cols-[minmax(0,1fr)_180px_140px_100px] items-center gap-4 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13.5px] transition',
      selected
        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-primary)_20%,transparent)]'
        : 'hover:bg-[var(--color-muted)]',
    ]"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span
        :class="[
          'grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)]',
          selected
            ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
            : 'bg-[var(--color-muted)] text-muted-foreground',
        ]"
      >
        <FileIcon
          :type="fileIconType(file)"
          :tone="selected ? 'primary' : 'muted'"
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
</template>
