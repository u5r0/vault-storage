<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Lock, Eye, EyeOff, Check, Circle } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"
import { validatePassword } from "../lib/passwordRules"

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const password            = ref("")
const confirmPassword     = ref("")
const showPassword        = ref(false)
const showConfirmPassword = ref(false)
const error               = ref("")
const token               = ref("")

const validation     = computed(() => validatePassword(password.value))
const strength       = computed(() => validation.value.strength)
const strengthLabel  = computed(() => validation.value.strengthLabel)
const strengthColor  = computed(() => [
  "",
  "var(--color-destructive)",
  "var(--color-accent)",
  "oklch(0.75 0.15 120)",
  "oklch(0.65 0.18 150)",
][strength.value])

const passwordsMatch = computed(() => password.value === confirmPassword.value)
const isValid = computed(() =>
  !!token.value &&
  validation.value.valid &&
  passwordsMatch.value,
)

onMounted(() => {
  token.value = (route.query.token as string) || ""
  if (!token.value) error.value = "Invalid or missing reset token."
})

async function handleSubmit() {
  error.value = ""
  if (!token.value) { error.value = "Invalid reset token."; return }
  if (!passwordsMatch.value) { error.value = "Passwords do not match."; return }
  if (!validation.value.valid) { error.value = validation.value.errors[0]; return }
  try {
    await auth.resetPassword(token.value, password.value)
    router.push("/login")
  } catch (err: any) {
    error.value = err.message || "Password reset failed."
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <BrandMark heading="Set new password" />

    <AuthCard>
      <form @submit.prevent="handleSubmit" class="space-y-5">
        <div class="space-y-2">
          <label for="password" class="block text-sm font-medium">New password</label>
          <div class="relative">
            <Lock :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="password" v-model="password" :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••••••" required :has-prefix="true" />
            <button type="button" @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
              <Eye v-if="!showPassword" :size="16" :stroke-width="2" />
              <EyeOff v-else :size="16" :stroke-width="2" />
            </button>
          </div>

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

          <!-- Realtime hint checklist -->
          <ul class="space-y-1 text-[11px]">
            <li v-for="hint in validation.hints" :key="hint.id"
                class="flex items-center gap-1.5"
                :class="hint.satisfied
                  ? 'text-[var(--color-foreground)]'
                  : (hint.required ? 'text-muted-foreground' : 'text-muted-foreground/70')">
              <Check v-if="hint.satisfied" :size="12" :stroke-width="2.5"
                :style="{ color: 'oklch(0.65 0.18 150)' }" />
              <Circle v-else :size="12" :stroke-width="2"
                class="text-muted-foreground/50" />
              <span>
                {{ hint.message }}
                <span v-if="!hint.required" class="text-muted-foreground/70">(optional)</span>
              </span>
            </li>
          </ul>
        </div>

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
          <p v-if="confirmPassword && !passwordsMatch"
            class="text-[11px] text-[var(--color-destructive)]">Passwords do not match</p>
        </div>

        <ErrorBanner v-if="error" :message="error" />

        <v-button type="submit" :loading="auth.loading" :disabled="!isValid" wide>
          Reset password
        </v-button>
      </form>
    </AuthCard>

    <div class="mt-6 text-center">
      <button type="button" @click="router.push('/login')"
        class="text-sm text-muted-foreground transition hover:text-foreground">
        Back to sign in
      </button>
    </div>
  </div>
</template>
