<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { Lock, Mail } from "@lucide/vue"
import { useAuthStore, AuthError } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const auth = useAuthStore()

const email    = ref("")
const password = ref("")
const error    = ref("")
// ADR 0019 §D4 — branch the UI on a structured code, not the message string.
const errorCode = ref<"" | "email_not_verified" | "other">("")
const resendSent    = ref(false)
const resendLoading = ref(false)

async function handleLogin() {
  error.value = ""
  errorCode.value = ""
  resendSent.value = false
  try {
    await auth.signIn(email.value, password.value)
    router.push("/contents")
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "email_not_verified") {
      errorCode.value = "email_not_verified"
      error.value = "Your email isn't verified yet. Check your inbox or request a new link."
    } else {
      errorCode.value = "other"
      error.value = err.message || "Login failed. Please try again."
    }
  }
}

async function handleResendVerification() {
  if (!email.value) return
  resendLoading.value = true
  try {
    await auth.resendVerification(email.value)
    resendSent.value = true
  } catch (err: any) {
    error.value = err.message || "Failed to resend verification email."
  } finally {
    resendLoading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <BrandMark heading="Welcome back" subheading="Sign in to your Vault account" />

    <AuthCard>
      <form @submit.prevent="handleLogin" class="space-y-5">
        <div class="space-y-2">
          <label for="email" class="block text-sm font-medium">Email</label>
          <div class="relative">
            <Mail :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="email" v-model="email" type="email" placeholder="you@example.com" required :has-prefix="true" />
          </div>
        </div>

        <div class="space-y-2">
          <label for="password" class="block text-sm font-medium">Password</label>
          <div class="relative">
            <Lock :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="password" v-model="password" type="password" placeholder="••••••••" required :has-prefix="true" />
          </div>
        </div>

        <ErrorBanner v-if="error" :message="error" />

        <!-- ADR 0019 §D4: surface a resend action when the server reports email_not_verified. -->
        <div v-if="errorCode === 'email_not_verified' && !resendSent" class="space-y-2">
          <v-button
            type="button"
            variant="outline"
            wide
            :loading="resendLoading"
            :disabled="!email"
            @click="handleResendVerification"
          >
            Resend verification email
          </v-button>
        </div>
        <p v-else-if="resendSent" class="text-xs text-muted-foreground">
          Verification email re-sent. Check your inbox.
        </p>

        <v-button type="submit" :loading="auth.loading" wide>Sign in</v-button>
      </form>
    </AuthCard>

    <div class="mt-6 space-y-3 text-center text-sm text-muted-foreground">
      <p>
        <router-link to="/forgot-password" class="hover:text-foreground hover:underline">
          Forgot password?
        </router-link>
      </p>
      <p>
        Don't have an account?
        <router-link to="/signup" class="font-medium text-[var(--color-primary)] hover:underline">Sign up</router-link>
      </p>
    </div>
  </div>
</template>
