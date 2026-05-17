<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue"
import { useTheme } from "./composables/useTheme"

useTheme()
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader />
    <RouterView />
  </div>
</template>
