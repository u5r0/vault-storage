<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Loader2, CheckCircle2, Mail } from "@lucide/vue"
import { useResendVerification, useVerifyToken } from "../composables/useAuthMutations"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const route  = useRoute()

const verify = useVerifyToken()
const resend = useResendVerification()

type State = "verifying" | "success" | "error"
const state       = ref<State>("verifying")
const tokenError  = ref("")
const resendEmail = ref("")
const resendSent  = ref(false)

const error = computed(
  () => tokenError.value || verify.error.value?.message || resend.error.value?.message || "",
)

onMounted(() => {
  const token = (route.query.token as string) || ""
  if (!token) {
    state.value = "error"
    tokenError.value = "Missing verification token."
    return
  }
  verify.mutate(token, {
    onSuccess: () => {
      state.value = "success"
      setTimeout(() => router.replace("/contents"), 600)
    },
    onError: () => {
      state.value = "error"
    },
  })
})

function handleResend() {
  if (!resendEmail.value) return
  resend.mutate(resendEmail.value, {
    onSuccess: () => { resendSent.value = true },
  })
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
            <v-button type="submit" :loading="resend.isPending.value" :disabled="!resendEmail" wide>
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
