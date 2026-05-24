<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Loader2, CheckCircle2, Mail } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

type State = "verifying" | "success" | "error"
const state         = ref<State>("verifying")
const error         = ref("")
const resendEmail   = ref("")
const resendSent    = ref(false)
const resendLoading = ref(false)

onMounted(async () => {
  const token = (route.query.token as string) || ""
  if (!token) {
    state.value = "error"
    error.value = "Missing verification token."
    return
  }
  try {
    await auth.verifyToken(token)
    // Per ADR 0019 §B6 the verify endpoint set session cookies and
    // populated the auth store; jump straight to the app.
    state.value = "success"
    setTimeout(() => router.replace("/contents"), 600)
  } catch (err: any) {
    state.value = "error"
    error.value = err.message || "This verification link is invalid or has expired."
  }
})

async function handleResend() {
  if (!resendEmail.value) return
  resendLoading.value = true
  try {
    await auth.resendVerification(resendEmail.value)
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
    <BrandMark heading="Verifying your email" />

    <AuthCard>
      <!-- Loading state -->
      <div v-if="state === 'verifying'" class="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 :size="28" :stroke-width="2" class="animate-spin text-muted-foreground" />
        <p class="text-sm text-muted-foreground">Confirming your email address…</p>
      </div>

      <!-- Success state -->
      <div v-else-if="state === 'success'" class="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 :size="40" :stroke-width="2" :style="{ color: 'oklch(0.65 0.18 150)' }" />
        <p class="text-sm font-medium">Email verified</p>
        <p class="text-xs text-muted-foreground">Taking you to your vault…</p>
      </div>

      <!-- Error state with resend form -->
      <div v-else class="space-y-4">
        <ErrorBanner :message="error" />

        <div v-if="!resendSent" class="space-y-3">
          <p class="text-sm text-muted-foreground">
            Verification links expire after 15 minutes. Enter your email and we'll send a new one.
          </p>
          <form @submit.prevent="handleResend" class="space-y-3">
            <div class="relative">
              <Mail :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
              <v-input v-model="resendEmail" type="email" placeholder="you@example.com" required :has-prefix="true" />
            </div>
            <v-button type="submit" :loading="resendLoading" :disabled="!resendEmail" wide>
              Resend verification email
            </v-button>
          </form>
        </div>

        <div v-else class="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 text-sm">
          <p class="font-medium">Check your inbox.</p>
          <p class="mt-1 text-muted-foreground">
            If an account matches that email and is unverified, a new verification link has been sent.
          </p>
        </div>

        <div class="text-center text-sm text-muted-foreground">
          <router-link to="/login" class="hover:text-foreground hover:underline">Back to sign in</router-link>
        </div>
      </div>
    </AuthCard>
  </div>
</template>
