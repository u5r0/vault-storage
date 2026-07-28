<script setup lang="ts">
import { useRoute } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import AppHeader from "@/components/AppHeader.vue"
import AppSidebar from "@/components/AppSidebar.vue"
import AuthLoading from "@/components/AuthLoading.vue"

const route = useRoute()
const auth = useAuthStore()

const requiresAuth = route.meta.requiresAuth ?? true
const showLoading = auth.isInitializing && requiresAuth
</script>

<template>
  <AuthLoading v-if="showLoading" />
  <div v-else class="flex h-screen flex-col">
    <AppHeader />
    <div class="flex flex-1 overflow-hidden">
      <AppSidebar />
      <slot />
    </div>
  </div>
</template>
