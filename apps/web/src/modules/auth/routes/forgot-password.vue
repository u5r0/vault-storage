<script setup lang="ts">
import { ref, computed } from "vue"
import { useRouter } from "vue-router"
import { Mail, ArrowLeft, CheckCircle } from "@lucide/vue"
import { useForgotPassword } from "../composables/useAuthMutations"
import BrandMark from "../components/BrandMark.vue"
import AuthCard from "../components/AuthCard.vue"
import ErrorBanner from "../components/ErrorBanner.vue"

const router = useRouter()
const forgot = useForgotPassword()

const email   = ref("")
const success = ref(false)

const error = computed(() => forgot.error.value?.message ?? "")

function handleSubmit() {
  forgot.mutate(email.value, {
    onSuccess: () => { success.value = true },
  })
}
</script>

<template>
  <div class="w-full max-w-md">
    <BrandMark heading="Reset password" />

    <AuthCard>
      <!-- Success state -->
      <div v-if="success" class="space-y-4 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <CheckCircle :size="28" :stroke-width="1.75" />
        </div>
        <div>
          <h2 class="text-base font-semibold">Check your email</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            If an account exists for <strong>{{ email }}</strong>, a reset link is on its way.
          </p>
        </div>
        <v-button wide @click="router.push('/login')">Back to sign in</v-button>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="handleSubmit" class="space-y-5">
        <p class="text-sm text-muted-foreground">
          Enter your email and we'll send you a link to reset your password.
        </p>

        <div class="space-y-2">
          <label for="email" class="block text-sm font-medium">Email</label>
          <div class="relative">
            <Mail :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
            <v-input id="email" v-model="email" type="email" placeholder="you@example.com" required :has-prefix="true" />
          </div>
        </div>

        <ErrorBanner v-if="error" :message="error" />

        <v-button type="submit" :loading="forgot.isPending.value" wide>Send reset link</v-button>
      </form>
    </AuthCard>

    <div class="mt-6 text-center">
      <button type="button" @click="router.push('/login')"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft :size="15" :stroke-width="2" /> Back to sign in
      </button>
    </div>
  </div>
</template>
