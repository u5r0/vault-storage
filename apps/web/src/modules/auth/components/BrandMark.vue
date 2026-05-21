<!-- Shared brand logo + tagline used at the top of every auth page -->
<script setup lang="ts">
defineProps<{
  heading: string
  subheading?: string
}>()
</script>

<template>
  <div class="mb-8 text-center">
    <div
      class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[var(--radius-xl)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_12px_32px_-12px_color-mix(in_oklch,var(--color-primary)_60%,transparent)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-8 w-8"
        aria-hidden="true"
      >
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.379a2 2 0 0 1 1.414.586l1.207 1.207A2 2 0 0 0 12.914 7.4H18.5A2.5 2.5 0 0 1 21 9.9v6.6A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      </svg>
    </div>
    <h1 class="text-2xl font-semibold tracking-tight">{{ heading }}</h1>
    <p v-if="subheading" class="mt-2 text-sm text-muted-foreground">{{ subheading }}</p>
  </div>
</template>
