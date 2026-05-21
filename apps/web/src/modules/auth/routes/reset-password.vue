<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Lock, Eye, EyeOff } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const password            = ref("")
const confirmPassword     = ref("")
const showPassword        = ref(false)
const showConfirmPassword = ref(false)
const error               = ref("")
const token               = ref("")

onMounted(() => {
  token.value = (route.query.token as string) || ""
  if (!token.value) error.value = "Invalid or missing reset token."
})

async function handleSubmit() {
  error.value = ""
  if (!token.value) { error.value = "Invalid reset token."; return }
  if (password.value !== confirmPassword.value) { error.value = "Passwords do not match."; return }
  if (password.value.length < 12) { error.value = "Password must be at least 12 characters."; return }
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
          <p class="text-[11px] text-muted-foreground">Recommended: 16+ characters. Minimum: 12.</p>
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
        </div>

        <ErrorBanner v-if="error" :message="error" />

        <v-button type="submit" :loading="auth.loading" :disabled="!token" wide>
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
