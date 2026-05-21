<script setup lang="ts">
defineProps<{
  size?: "sm" | "md" | "lg"
}>()
</script>

<template>
  <span
    role="status"
    aria-label="Loading"
    :class="[
      'inline-block animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--color-muted-foreground)]',
      size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-3 w-3' : 'h-5 w-5',
    ]"
    aria-hidden="true"
  />
</template>
