<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import AuthLoading from "@/components/AuthLoading.vue"

const route = useRoute()
const auth = useAuthStore()

const requiresAuth = route.meta.requiresAuth ?? true
const showLoading = computed(() => {
  if (requiresAuth && (auth.isInitializing || !auth.isAuthenticated)) return true
  return false
})
</script>

<template>
  <Transition name="auth-fade" mode="out-in">
    <AuthLoading v-if="showLoading" key="loading" />
    <div v-else key="auth" class="flex min-h-screen items-center justify-center grain px-4">
      <slot />
    </div>
  </Transition>
</template>

<style scoped>
.auth-fade-enter-active,
.auth-fade-leave-active {
  transition: opacity 0.2s ease;
}
.auth-fade-enter-from,
.auth-fade-leave-to {
  opacity: 0;
}
</style>
