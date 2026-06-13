<script setup lang="ts">
import { computed } from "vue"
import { X } from "@lucide/vue"
import type { UploadHandle } from "@/stores/upload"

const props = defineProps<{
  files: UploadHandle[]
}>()

const emit = defineEmits<{
  (e: "remove", id: string): void
}>()

function percent(file: UploadHandle): number {
  if (file.size === 0) return file.state.status === "completed" ? 100 : 0
  return Math.min(100, Math.round((file.state.bytesUploaded / file.size) * 100))
}

function isDone(file: UploadHandle): boolean {
  return file.state.status === "completed"
}

function isError(file: UploadHandle): boolean {
  return file.state.status === "error"
}

function errorMessage(file: UploadHandle): string {
  return file.state.status === "error" ? file.state.error.message : ""
}

const visible = computed(() =>
  // Hide canceled rows — the user already removed them.
  props.files.filter((f) => f.state.status !== "canceled"),
)
</script>

<template>
  <ul class="flex flex-col gap-1.5">
    <li
      v-for="file in visible"
      :key="file.id"
      class="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2"
    >
      <!-- Progress bar -->
      <div class="min-w-0 flex-1">
        <p class="truncate text-[13px] font-medium">{{ file.name }}</p>
        <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div
            class="h-full rounded-full transition-all duration-200"
            :class="isError(file)
              ? 'bg-[var(--color-destructive)]'
              : 'bg-[var(--color-primary)]'"
            :style="{ width: `${percent(file)}%` }"
          />
        </div>
        <p
          v-if="isError(file)"
          class="mt-1 truncate text-[11px] text-[var(--color-destructive)]"
          :title="errorMessage(file)"
        >
          {{ errorMessage(file) }}
        </p>
      </div>

      <!-- Status / remove -->
      <span
        v-if="isDone(file)"
        class="shrink-0 text-[11.5px] text-[var(--color-primary)]"
      >Done</span>
      <button
        v-else
        type="button"
        :aria-label="`Remove ${file.name}`"
        class="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
        @click="emit('remove', file.id)"
      >
        <X :size="13" :stroke-width="2" />
      </button>
    </li>
  </ul>
</template>
