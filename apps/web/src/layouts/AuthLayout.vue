<script setup lang="ts">
import { useRoute } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import AuthLoading from "@/components/AuthLoading.vue"

const route = useRoute()
const auth = useAuthStore()

const requiresAuth = route.meta.requiresAuth ?? true
const showLoading = auth.isInitializing && requiresAuth
</script>

<template>
  <AuthLoading v-if="showLoading" />
  <div v-else class="flex min-h-screen items-center justify-center grain px-4">
    <slot />
  </div>
</template>
