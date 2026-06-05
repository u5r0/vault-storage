<script setup lang="ts">
import { ref, computed } from "vue"
import { Lock, Mail } from "@lucide/vue"
import { useSignIn, useResendVerification, AuthError } from "../composables/useAuthMutations"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const email    = ref("")
const password = ref("")

// ADR 0019 §D4 — branch the UI on a structured code, not the message string.
const errorCode = ref<"" | "email_not_verified" | "other">("")
const resendSent = ref(false)

const signIn = useSignIn()
const resend = useResendVerification()

const error = computed(() => signIn.error.value?.message ?? "")

async function handleLogin() {
  errorCode.value = ""
  resendSent.value = false
  signIn.mutate(
    { email: email.value, password: password.value },
    {
      onError: (err) => {
        if (err instanceof AuthError && err.code === "email_not_verified") {
          errorCode.value = "email_not_verified"
        } else {
          errorCode.value = "other"
        }
      },
    },
  )
}

function handleResendVerification() {
  if (!email.value) return
  resend.mutate(email.value, {
    onSuccess: () => { resendSent.value = true },
  })
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
            :loading="resend.isPending.value"
            :disabled="!email"
            @click="handleResendVerification"
          >
            Resend verification email
          </v-button>
        </div>
        <p v-else-if="resendSent" class="text-xs text-muted-foreground">
          Verification email re-sent. Check your inbox.
        </p>

        <v-button type="submit" :loading="signIn.isPending.value" wide>Sign in</v-button>
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
