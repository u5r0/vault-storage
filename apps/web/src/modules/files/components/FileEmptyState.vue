<script setup lang="ts">
import { FolderOpen } from "@lucide/vue"

const props = defineProps<{
  isRoot: boolean
}>()

const emit = defineEmits<{
  "create-folder": []
}>()
</script>

<template>
  <div class="grid flex-1 place-items-center px-6 py-10 text-center">
    <div class="w-full max-w-md">
      <FolderOpen :size="28" :stroke-width="1.5" class="mx-auto text-muted-foreground/70" />
      <p class="mt-3 text-sm font-medium">This folder is empty</p>
      <p v-if="isRoot" class="mt-1 text-[12px] text-muted-foreground">Create a folder to get started.</p>
      <p v-else class="mt-1 text-[12px] text-muted-foreground">Drop files here or browse to upload.</p>
      <div v-if="isRoot" class="mt-5">
        <button
          type="button"
          @click="emit('create-folder')"
          class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
        >
          <FolderOpen :size="16" :stroke-width="2" />
          Create new folder
        </button>
      </div>
    </div>
  </div>
</template>
