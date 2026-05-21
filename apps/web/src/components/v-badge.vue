<script setup lang="ts">
defineProps<{
  variant?: "default" | "primary" | "accent" | "destructive"
}>()
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
      variant === 'primary'
        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
        : variant === 'accent'
          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent-foreground)]'
          : variant === 'destructive'
            ? 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]'
            : 'bg-[var(--color-muted)] text-muted-foreground',
    ]"
  >
    <slot />
  </span>
</template>
