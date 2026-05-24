<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue"
import { useRoute } from "vue-router"
import { Mail, MailCheck } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const route = useRoute()
const auth  = useAuthStore()

const email     = computed(() => (route.query.email as string) || "")
const error     = ref("")
const sent      = ref(false)
const cooldown  = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const COOLDOWN_SECS = 30

function startCooldown() {
  cooldown.value = COOLDOWN_SECS
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})

async function handleResend() {
  if (!email.value || cooldown.value > 0) return
  error.value = ""
  try {
    await auth.resendVerification(email.value)
    sent.value = true
    startCooldown()
  } catch (err: any) {
    error.value = err.message || "Failed to resend verification email."
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <BrandMark heading="Check your email" />

    <AuthCard>
      <div class="space-y-4 text-center">
        <div class="flex justify-center">
          <MailCheck :size="44" :stroke-width="1.75" :style="{ color: 'var(--color-primary)' }" />
        </div>
        <p class="text-sm">
          We sent a verification link to
          <strong v-if="email">{{ email }}</strong>
          <span v-else>your email</span>.
        </p>
        <p class="text-xs text-muted-foreground">
          Click the link to finish setting up your account. The link expires in 15 minutes.
        </p>

        <ErrorBanner v-if="error" :message="error" />

        <p v-if="sent" class="text-xs text-muted-foreground">
          Verification email re-sent. Check your inbox.
        </p>

        <div class="pt-2">
          <v-button
            type="button"
            variant="outline"
            wide
            :loading="auth.loading"
            :disabled="!email || cooldown > 0"
            @click="handleResend"
          >
            <Mail :size="14" :stroke-width="2" />
            <span v-if="cooldown > 0">Resend in {{ cooldown }}s</span>
            <span v-else>Resend verification email</span>
          </v-button>
        </div>
      </div>
    </AuthCard>

    <p class="mt-6 text-center text-sm text-muted-foreground">
      Wrong email?
      <router-link to="/signup" class="font-medium text-[var(--color-primary)] hover:underline">Start over</router-link>
    </p>
  </div>
</template>
