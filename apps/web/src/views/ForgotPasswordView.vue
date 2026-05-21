<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { Mail, ArrowLeft } from "@lucide/vue"
import { useAuth } from "@/composables/useAuth"

const router = useRouter()
const { forgotPassword } = useAuth()
const email = ref("")
const loading = ref(false)
const error = ref("")
const success = ref(false)

async function handleForgotPassword() {
  loading.value = true
  error.value = ""
  success.value = false

  try {
    await forgotPassword(email.value)
    success.value = true
  } catch (err: any) {
    error.value = err.message || "Failed to send reset email."
  } finally {
    loading.value = false
  }
}
</script>

<template>
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
        <div v-if="success" class="space-y-4 text-center">
          <div
            class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          >
            <Mail :size="24" :stroke-width="2" />
          </div>
          <h2 class="text-lg font-medium">Check your email</h2>
          <p class="text-sm text-muted-foreground">
            We've sent a password reset link to {{ email }} if an account exists.
          </p>
          <button
            type="button"
            @click="router.push('/login')"
            class="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
          >
            Back to login
          </button>
        </div>

        <form v-else @submit.prevent="handleForgotPassword" class="space-y-4">
          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="block text-sm font-medium text-foreground">
              Email
            </label>
            <div class="relative">
              <Mail
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                :stroke-width="2"
              />
              <input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                required
                class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-10 py-2.5 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
              />
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="rounded-[var(--radius-sm)] bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
            {{ error }}
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
          >
            {{ loading ? "Sending..." : "Send reset link" }}
          </button>
        </form>
      </div>

      <!-- Back to login -->
      <div class="mt-6 text-center">
        <button
          type="button"
          @click="router.push('/login')"
          class="flex items-center justify-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft :size="16" :stroke-width="2" />
          Back to login
        </button>
      </div>
  </div>
</template>
