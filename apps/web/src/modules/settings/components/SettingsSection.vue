<!-- Wrapper card for each settings section -->
<script setup lang="ts">
defineProps<{ title: string; danger?: boolean }>()
</script>

<template>
  <div
    :class="[
      'rounded-[var(--radius-lg)] border p-6',
      danger
        ? 'border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/5'
        : 'border-[var(--color-border)] bg-[var(--color-card)]',
    ]"
  >
    <h2
      :class="[
        'mb-5 text-base font-semibold',
        danger ? 'text-[var(--color-destructive)]' : '',
      ]"
    >
      {{ title }}
    </h2>
    <slot />
  </div>
</template>
