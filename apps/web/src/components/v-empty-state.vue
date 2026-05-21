<script setup lang="ts">
import { FolderOpen } from "@lucide/vue"

defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="grid flex-1 place-items-center px-6 py-10 text-center">
    <div class="w-full max-w-md">
      <slot name="icon">
        <FolderOpen :size="28" :stroke-width="1.5" class="mx-auto text-muted-foreground/70" />
      </slot>
      <p class="mt-3 text-sm font-medium">{{ title ?? "Nothing here yet" }}</p>
      <p v-if="description" class="mt-1 text-[12px] text-muted-foreground">{{ description }}</p>
      <div v-if="$slots.action" class="mt-5">
        <slot name="action" />
      </div>
    </div>
  </div>
</template>
