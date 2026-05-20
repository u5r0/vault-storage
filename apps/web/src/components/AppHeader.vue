<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import {
  Search,
  Settings,
  Sun,
  Moon,
  Command,
  Plus,
  Upload,
  LogOut,
} from "@lucide/vue"
import { useTheme, type ThemeMode } from "@/composables/useTheme"
import { useAuth } from "@/composables/useAuth"

const { mode, setMode } = useTheme()
const { user, signOut } = useAuth()
const router = useRouter()
const query = ref("")

const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
]

async function handleSignOut() {
  await signOut()
  router.push("/login")
}
</script>

<template>
  <header
    class="sticky top-0 z-30 w-full border-b border-[var(--color-border)] glass"
  >
    <div class="flex h-16 items-center gap-3 px-4 md:px-6">
      <!-- Brand -->
      <a
        href="#"
        class="group flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors hover:bg-[var(--color-muted)]"
      >
        <span
          class="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--color-primary)_60%,transparent)]"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5"
          >
            <path
              d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.379a2 2 0 0 1 1.414.586l1.207 1.207A2 2 0 0 0 12.914 7.4H18.5A2.5 2.5 0 0 1 21 9.9v6.6A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"
            />
          </svg>
        </span>
        <div class="hidden flex-col leading-tight sm:flex">
          <span class="text-sm font-semibold tracking-tight">Vault</span>
          <span class="text-[11px] text-muted-foreground">Personal · 1.2 TB</span>
        </div>
      </a>

      <!-- Search -->
      <div class="ml-2 flex-1">
        <label
          class="group flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 px-3.5 py-2.5 text-sm transition focus-within:border-[var(--color-ring)] focus-within:bg-[var(--color-card)] focus-within:ring-2 focus-within:ring-[var(--color-ring)]/30"
        >
          <Search :size="16" class="text-muted-foreground" :stroke-width="2" />
          <input
            v-model="query"
            type="text"
            placeholder="Search files, folders, and tags..."
            class="w-full bg-transparent text-sm placeholder:text-muted-foreground/80 focus:outline-none"
          />
          <span
            class="hidden items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline-flex"
          >
            <Command :size="11" :stroke-width="2.5" /> K
          </span>
        </label>
      </div>

      <!-- Quick actions -->
      <div class="hidden items-center gap-1.5 md:flex">
        <button
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)]"
          type="button"
        >
          <Upload :size="15" :stroke-width="2" />
          Upload
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
          type="button"
        >
          <Plus :size="15" :stroke-width="2.5" />
          New
        </button>
      </div>

      <!-- Theme toggle -->
      <div
        role="radiogroup"
        aria-label="Theme"
        class="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 p-1"
      >
        <button
          v-for="t in themes"
          :key="t.id"
          type="button"
          role="radio"
          :aria-checked="mode === t.id"
          :aria-label="t.label"
          @click="setMode(t.id)"
          :class="[
            'grid h-7 w-8 place-items-center rounded-[var(--radius-xs)] transition',
            mode === t.id
              ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          <component :is="t.icon" :size="14" :stroke-width="2.25" />
        </button>
      </div>

      <!-- Settings + avatar + sign out -->
      <button
        type="button"
        aria-label="Settings"
        class="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-foreground"
      >
        <Settings :size="18" :stroke-width="1.75" />
      </button>

      <button
        type="button"
        @click="handleSignOut"
        aria-label="Sign out"
        class="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-destructive"
        title="Sign out"
      >
        <LogOut :size="18" :stroke-width="1.75" />
      </button>

      <button
        type="button"
        aria-label="Account"
        class="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full ring-2 ring-[var(--color-border)] transition hover:ring-[var(--color-primary)]"
      >
        <span
          class="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-sm font-semibold text-[var(--color-primary-foreground)]"
        >
          {{ user?.email?.charAt(0).toUpperCase() || "U" }}
        </span>
        <span
          class="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--color-background)]"
          aria-hidden="true"
        />
      </button>
    </div>
  </header>
</template>
