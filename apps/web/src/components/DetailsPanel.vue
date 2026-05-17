<script setup lang="ts">
import { computed } from "vue"
import { Share2, Download } from "lucide-vue-next"
import FileIcon from "./FileIcon.vue"
import type { VaultEntry } from "@vault/sdk"
import { formatSize, formatDate, typeLabel, fileIconType } from "@/lib/format"
import { client } from "@/lib/client"

const props = defineProps<{ file: VaultEntry | null }>()

const meta = computed(() => {
  if (!props.file) return []
  return [
    { label: "Type", value: typeLabel(props.file) },
    { label: "Modified", value: formatDate(props.file.modifiedAt) },
    { label: "Size", value: formatSize(props.file.size) },
    ...(props.file.contentType ? [{ label: "MIME", value: props.file.contentType }] : []),
  ]
})

function downloadUrl(file: VaultEntry): string {
  return client.getDownloadUrl(file.path)
}
</script>

<template>
  <aside
    class="hidden h-full w-80 shrink-0 flex-col gap-5 overflow-y-auto bg-[var(--color-background)]/60 p-5 lg:flex"
  >
    <template v-if="file">
      <!-- Preview -->
      <div
        class="relative flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] px-5 pt-8 pb-6 grain"
      >
        <span
          class="grid h-20 w-20 place-items-center rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-primary)_20%,transparent)]"
        >
          <FileIcon :type="fileIconType(file)" :size="36" tone="primary" />
        </span>

        <div class="text-center">
          <p class="text-base font-semibold tracking-tight text-balance">{{ file.name }}</p>
          <p class="mt-1 text-[12px] text-muted-foreground">
            {{ typeLabel(file) }} · {{ formatSize(file.size) }}
          </p>
        </div>

        <div class="flex w-full items-center gap-2 pt-1">
          <a
            :href="downloadUrl(file)"
            :download="file.name"
            class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[12.5px] font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
          >
            <Download :size="13" :stroke-width="2.25" /> Download
          </a>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[12.5px] font-medium transition hover:bg-[var(--color-muted)]"
          >
            <Share2 :size="13" :stroke-width="2.25" /> Share
          </button>
        </div>
      </div>

      <!-- Details -->
      <div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Details
        </h3>
        <dl class="flex flex-col gap-2.5">
          <div
            v-for="row in meta"
            :key="row.label"
            class="flex items-baseline justify-between gap-3 text-[13px]"
          >
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="text-right font-medium tabular-nums">{{ row.value }}</dd>
          </div>
        </dl>
      </div>
    </template>

    <template v-else>
      <div class="grid h-full place-items-center px-4 text-center">
        <div>
          <p class="text-sm font-medium">Nothing selected</p>
          <p class="mt-1 text-[12px] text-muted-foreground">
            Pick a file from the list to view its details.
          </p>
        </div>
      </div>
    </template>
  </aside>
</template>
