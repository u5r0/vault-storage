<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import AppHeader from "./components/AppHeader.vue"
import { useTheme } from "./composables/useTheme"

useTheme()

const route = useRoute()
const isAuthPage = computed(() => 
  route.name === "login" || 
  route.name === "signup" || 
  route.name === "forgot-password" || 
  route.name === "reset-password" ||
  route.name === "verify"
)
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader v-if="!isAuthPage" />
    <RouterView />
  </div>
</template>
