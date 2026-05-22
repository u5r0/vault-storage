<!-- Wrapper card for each settings section -->
<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; danger?: boolean }>()
</script>

<template>
  <section
    :class="[
      'rounded-[var(--radius-lg)] border p-6 md:p-7',
      danger
        ? 'border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/5'
        : 'border-[var(--color-border)] bg-[var(--color-card)]',
    ]"
  >
    <header class="mb-5">
      <h2
        :class="[
          'text-base font-semibold tracking-tight',
          danger ? 'text-[var(--color-destructive)]' : '',
        ]"
      >
        {{ title }}
      </h2>
      <p v-if="subtitle" class="mt-1 text-[12.5px] text-muted-foreground">
        {{ subtitle }}
      </p>
    </header>
    <slot />
  </section>
</template>
