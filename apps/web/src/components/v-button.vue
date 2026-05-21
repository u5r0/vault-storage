<script setup lang="ts">
defineProps<{
  variant?: "primary" | "outline" | "ghost"
  size?: "md" | "sm"
  type?: "button" | "submit" | "reset"
  loading?: boolean
  disabled?: boolean
  wide?: boolean
}>()

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 font-medium transition',
      'disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm'
        ? 'rounded-[var(--radius-xs)] px-3 py-1.5 text-xs'
        : 'rounded-[var(--radius-sm)] px-4 py-2.5 text-sm',
      variant === 'outline'
        ? 'border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]'
        : variant === 'ghost'
          ? 'hover:bg-[var(--color-muted)]'
          : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90',
      wide ? 'w-full' : '',
    ]"
    @click="$emit('click', $event)"
  >
    <slot />
    <span v-if="loading" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
  </button>
</template>
