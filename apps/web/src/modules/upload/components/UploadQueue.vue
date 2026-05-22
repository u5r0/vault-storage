<script setup lang="ts">
import Uppy from "@uppy/core"
import { X } from "@lucide/vue"
import type { UploadFile } from "@/stores/upload"

defineProps<{
  uppy: Uppy
  files: UploadFile[]
}>()
</script>

<template>
  <ul class="flex flex-col gap-1.5">
    <li
      v-for="file in files"
      :key="file.id"
      class="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2"
    >
      <!-- Progress bar -->
      <div class="min-w-0 flex-1">
        <p class="truncate text-[13px] font-medium">{{ file.name }}</p>
        <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div
            class="h-full rounded-full bg-[var(--color-primary)] transition-all duration-200"
            :style="{ width: `${file.progress?.percentage ?? 0}%` }"
          />
        </div>
      </div>

      <!-- Status / remove -->
      <span
        v-if="file.progress?.uploadComplete"
        class="shrink-0 text-[11.5px] text-[var(--color-primary)]"
      >Done</span>
      <button
        v-else
        type="button"
        :aria-label="`Remove ${file.name}`"
        class="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
        @click="uppy.removeFile(file.id)"
      >
        <X :size="13" :stroke-width="2" />
      </button>
    </li>
  </ul>
</template>
