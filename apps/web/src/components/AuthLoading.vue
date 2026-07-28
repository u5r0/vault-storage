<script setup lang="ts">
import { onUnmounted } from "vue"
import vSpinner from "@/components/v-spinner.vue"

onUnmounted(() => {
  const root = document.documentElement
  root.style.removeProperty('overflow')
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-background)]"
  >
    <v-spinner size="lg" />
  </div>
</template>
