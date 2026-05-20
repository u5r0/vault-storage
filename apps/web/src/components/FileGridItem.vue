<script setup lang="ts">
import type { VaultEntry } from "@vault/sdk"
import FileIcon from "./FileIcon.vue"
import { formatSize, typeLabel, fileIconType } from "@/lib/format"

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
      'group flex h-full w-full flex-col items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition',
      selected
        ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]'
        : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--color-primary)_25%,transparent)]',
    ]"
  >
    <span
      :class="[
        'grid h-10 w-10 place-items-center rounded-[var(--radius-sm)]',
        selected
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'bg-[var(--color-muted)] text-muted-foreground group-hover:text-foreground',
      ]"
    >
      <FileIcon :type="fileIconType(file)" :size="20" />
    </span>
    <div class="min-w-0">
      <p class="truncate text-[13.5px] font-medium">{{ file.name }}</p>
      <p class="truncate text-[11.5px] text-muted-foreground">
        {{ typeLabel(file) }} · {{ formatSize(file.size) }}
      </p>
    </div>
  </button>
</template>
