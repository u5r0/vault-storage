<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Lock, Eye, EyeOff } from "@lucide/vue"
import { useAuth } from "@/composables/useAuth"

const router = useRouter()
const route = useRoute()
const { resetPassword } = useAuth()
const password = ref("")
const confirmPassword = ref("")
const loading = ref(false)
const error = ref("")
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const token = ref("")

onMounted(() => {
  token.value = route.query.token as string || ""
  if (!token.value) {
    error.value = "Invalid or missing reset token."
  }
})

async function handleResetPassword() {
  loading.value = true
  error.value = ""

  if (!token.value) {
    error.value = "Invalid reset token."
    loading.value = false
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = "Passwords do not match."
    loading.value = false
    return
  }

  if (password.value.length < 12) {
    error.value = "Password must be at least 12 characters."
    loading.value = false
    return
  }

  try {
    await resetPassword(token.value, password.value)
    router.push("/login")
  } catch (err: any) {
    error.value = err.message || "Password reset failed."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center grain px-4">
    <div class="w-full max-w-md">
      <!-- Logo/Brand -->
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
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-semibold text-foreground">Reset Password</h1>
      </div>

      <!-- Form -->
      <div
        class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--color-foreground)_5%,transparent)]"
      >
        <form @submit.prevent="handleResetPassword" class="space-y-4">
          <!-- Password -->
          <div class="space-y-2">
            <label for="password" class="block text-sm font-medium text-foreground">
              New Password
            </label>
            <div class="relative">
              <Lock
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                :stroke-width="2"
              />
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••••••••••"
                required
                minlength="12"
                class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-10 py-2.5 pr-10 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <Eye v-if="!showPassword" :size="16" :stroke-width="2" />
                <EyeOff v-else :size="16" :stroke-width="2" />
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Recommended: 16+ characters. Minimum: 12 characters.
            </p>
          </div>

          <!-- Confirm Password -->
          <div class="space-y-2">
            <label for="confirmPassword" class="block text-sm font-medium text-foreground">
              Confirm Password
            </label>
            <div class="relative">
              <Lock
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                :stroke-width="2"
              />
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="••••••••••••••••"
                required
                minlength="12"
                class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-10 py-2.5 pr-10 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
              />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <Eye v-if="!showConfirmPassword" :size="16" :stroke-width="2" />
                <EyeOff v-else :size="16" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="rounded-[var(--radius-sm)] bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
            {{ error }}
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading || !token"
            class="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
          >
            {{ loading ? "Resetting..." : "Reset password" }}
          </button>
        </form>
      </div>

      <!-- Back to login -->
      <div class="mt-6 text-center">
        <button
          type="button"
          @click="router.push('/login')"
          class="text-sm text-muted-foreground transition hover:text-foreground"
        >
          Back to login
        </button>
      </div>
    </div>
  </div>
</template>
