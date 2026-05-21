<script setup lang="ts">
import { ref } from "vue"
import type { Uppy } from "@uppy/core"

const props = defineProps<{
  uppy: Uppy
  compact?: boolean
}>()

const isDragging = ref(false)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const items = e.dataTransfer?.files
  if (!items?.length) return
  const files = Array.from(items).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    data: file,
  }))
  props.uppy.addFiles(files)
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const files = Array.from(input.files).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    data: file,
  }))
  props.uppy.addFiles(files)
  input.value = ""
}
</script>

<template>
  <label
    :class="[
      'flex cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed transition',
      compact
        ? 'min-h-[2.75rem] border-[var(--color-border)] bg-[var(--color-muted)]/55 px-3 text-[12.5px] text-muted-foreground hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary-soft)]/40'
        : 'min-h-[9rem] border-[color-mix(in_oklch,var(--color-primary)_35%,var(--color-border))] bg-[color-mix(in_oklch,var(--color-primary-soft)_45%,transparent)] text-[13px] text-foreground hover:border-[color-mix(in_oklch,var(--color-primary)_55%,var(--color-border))] hover:bg-[color-mix(in_oklch,var(--color-primary-soft)_65%,transparent)]',
      isDragging && 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]',
    ]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <span>Drop files here or <span class="font-medium text-[var(--color-primary)]">browse</span></span>
    <input
      type="file"
      multiple
      class="sr-only"
      @change="onFileInput"
    />
  </label>
</template>
