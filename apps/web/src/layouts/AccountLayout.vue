<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ArrowLeft, LogOut, Sun, Moon } from "@lucide/vue"
import { useQueryClient } from "@tanstack/vue-query"
import { useUIStore, type ThemeMode } from "@/stores/ui"
import { useAuthStore } from "@/stores/auth"
import AccountNav from "@/components/AccountNav.vue"
import AuthLoading from "@/components/AuthLoading.vue"

const route       = useRoute()
const router      = useRouter()
const ui          = useUIStore()
const auth        = useAuthStore()
const queryClient = useQueryClient()

const requiresAuth = route.meta.requiresAuth ?? true
const showLoading = auth.isInitializing && requiresAuth

const mode = computed(() => ui.theme)
const user = computed(() => auth.user)

const heading = computed(() => {
  if (route.name === "profile") return "Profile"
  const section = (route.query.section as string) || "account"
  const titles: Record<string, string> = {
    account: "Account",
    notifications: "Notifications",
    security: "Security",
    appearance: "Appearance",
    files: "Files",
    storage: "Storage",
    danger: "Danger zone",
  }
  return titles[section] ?? "Settings"
})

const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun,  label: "Light" },
  { id: "dark",  icon: Moon, label: "Dark"  },
]

async function signOut() {
  await auth.signOut()
  queryClient.removeQueries({ queryKey: ["files"] })
  router.push({ name: "login" })
}

function backToVault() {
  router.push({ name: "content" })
}
</script>

<template>
  <AuthLoading v-if="showLoading" />
  <div v-else class="flex min-h-screen flex-col bg-[var(--color-background)]">
    <!-- Slim top bar -->
    <header class="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          @click="backToVault"
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-[var(--color-muted)]/60 hover:text-foreground"
        >
          <ArrowLeft :size="14" :stroke-width="2" />
          <span class="hidden sm:inline">Back to Vault</span>
        </button>

        <div class="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden="true" />

        <p class="text-[13.5px] font-semibold tracking-tight">{{ heading }}</p>

        <div class="ml-auto flex items-center gap-2">
          <!-- Theme -->
          <div
            role="radiogroup"
            aria-label="Theme"
            class="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-1"
          >
            <button
              v-for="t in themes"
              :key="t.id"
              type="button"
              role="radio"
              :aria-checked="mode === t.id"
              :aria-label="t.label"
              @click="ui.setTheme(t.id)"
              :class="[
                'grid h-6 w-7 place-items-center rounded-[var(--radius-xs)] transition',
                mode === t.id
                  ? 'bg-[var(--color-card)] text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ]"
            >
              <component :is="t.icon" :size="13" :stroke-width="2.25" />
            </button>
          </div>

          <button
            type="button"
            @click="signOut"
            class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-[var(--color-muted)]/60 hover:text-foreground"
            title="Sign out"
          >
            <LogOut :size="14" :stroke-width="2" />
            <span class="hidden sm:inline">Sign out</span>
          </button>

          <span
            class="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-[12px] font-semibold text-[var(--color-primary-foreground)] ring-2 ring-[var(--color-border)]"
          >
            {{ user?.email?.charAt(0).toUpperCase() ?? "U" }}
          </span>
        </div>
      </div>
    </header>

    <!-- Two-column body -->
    <div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6 lg:flex-row lg:gap-10">
      <aside class="lg:w-60 lg:shrink-0">
        <AccountNav />
      </aside>

      <div class="min-w-0 flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>
