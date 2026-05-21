<script setup lang="ts">
import { ref, computed } from "vue"
import { useRouter } from "vue-router"
import { Lock, Mail, Eye, EyeOff, User } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const auth = useAuthStore()

const name               = ref("")
const email              = ref("")
const password           = ref("")
const confirmPassword    = ref("")
const agreeToTerms       = ref(false)
const error              = ref("")
const showPassword       = ref(false)
const showConfirmPassword = ref(false)

import { validatePassword } from "../lib/passwordRules"

// Strength derived from shared rules (ADR 0002)
const validation = computed(() => validatePassword(password.value))
const strength       = computed(() => validation.value.strength)
const strengthLabel  = computed(() => validation.value.strengthLabel)
const strengthColor  = computed(() => [
  "",
  "var(--color-destructive)",
  "var(--color-accent)",
  "oklch(0.75 0.15 120)",
  "oklch(0.65 0.18 150)",
][strength.value])

const isValid = computed(() =>
  name.value.trim().length > 0 &&
  email.value.includes("@") &&
  password.value.length >= 12 &&
  password.value === confirmPassword.value &&
  agreeToTerms.value,
)

async function handleSignup() {
  error.value = ""
  if (password.value !== confirmPassword.value) { error.value = "Passwords do not match."; return }
  if (password.value.length < 12) { error.value = "Password must be at least 12 characters."; return }
  if (!agreeToTerms.value) { error.value = "You must agree to the terms of service."; return }
  try {
    await auth.signUp(email.value, password.value)
    router.push("/contents")
  } catch (err: any) {
    error.value = err.message || "Signup failed. Please try again."
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <BrandMark heading="Create an account" subheading="Start organizing your files with Vault" />

    <AuthCard>
      <form @submit.prevent="handleSignup" class="space-y-5">
        <!-- Name -->
        <div class="space-y-2">
          <label for="name" class="block text-sm font-medium">Full name</label>
          <div class="relative">
            <User :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="name" v-model="name" placeholder="John Doe" required :has-prefix="true" />
          </div>
        </div>

        <!-- Email -->
        <div class="space-y-2">
          <label for="email" class="block text-sm font-medium">Email</label>
          <div class="relative">
            <Mail :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="email" v-model="email" type="email" placeholder="you@example.com" required :has-prefix="true" />
          </div>
        </div>

        <!-- Password -->
        <div class="space-y-2">
          <label for="password" class="block text-sm font-medium">Password</label>
          <div class="relative">
            <Lock :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••••••" required :has-prefix="true" />
            <button type="button" @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
              <Eye v-if="!showPassword" :size="16" :stroke-width="2" />
              <EyeOff v-else :size="16" :stroke-width="2" />
            </button>
          </div>
          <p class="text-[11px] text-muted-foreground">Recommended: 16+ characters. Minimum: 12.</p>
          <!-- Strength bar -->
          <div v-if="password" class="space-y-1.5">
            <div class="flex gap-1">
              <div v-for="i in 4" :key="i"
                class="h-1 flex-1 rounded-full transition-all duration-300"
                :style="{ backgroundColor: i <= strength ? strengthColor : 'var(--color-border)' }" />
            </div>
            <p class="text-[11px]" :style="{ color: strengthColor }">
              Password strength: <strong>{{ strengthLabel }}</strong>
            </p>
          </div>
        </div>

        <!-- Confirm password -->
        <div class="space-y-2">
          <label for="confirm" class="block text-sm font-medium">Confirm password</label>
          <div class="relative">
            <Lock :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="confirm" v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="••••••••" required :has-prefix="true" />
            <button type="button" @click="showConfirmPassword = !showConfirmPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
              <Eye v-if="!showConfirmPassword" :size="16" :stroke-width="2" />
              <EyeOff v-else :size="16" :stroke-width="2" />
            </button>
          </div>
          <p v-if="confirmPassword && confirmPassword !== password"
            class="text-[11px] text-[var(--color-destructive)]">Passwords do not match</p>
        </div>

        <!-- Terms -->
        <label class="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input v-model="agreeToTerms" type="checkbox" required
            class="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" />
          I agree to the
          <a href="#" class="underline hover:text-foreground">Terms</a>
          and
          <a href="#" class="underline hover:text-foreground">Privacy Policy</a>
        </label>

        <ErrorBanner v-if="error" :message="error" />

        <v-button type="submit" :loading="auth.loading" :disabled="!isValid" wide>
          Create account
        </v-button>
      </form>
    </AuthCard>

    <p class="mt-6 text-center text-sm text-muted-foreground">
      Already have an account?
      <router-link to="/login" class="font-medium text-[var(--color-primary)] hover:underline">Sign in</router-link>
    </p>
  </div>
</template>
