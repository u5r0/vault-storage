<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div
    role="alert"
    class="rounded-[var(--radius-sm)] border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-2.5 text-sm text-[var(--color-destructive)]"
  >
    {{ message }}
  </div>
</template>
