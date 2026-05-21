<script setup lang="ts">
import AppHeader from "@/components/AppHeader.vue"
import AppSidebar from "@/components/AppSidebar.vue"
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader />
    <div class="flex flex-1 overflow-hidden">
      <AppSidebar />
      <slot />
    </div>
  </div>
</template>
