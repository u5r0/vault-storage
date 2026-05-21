<script setup lang="ts">
import { ref, computed, inject } from "vue"
import { useRouter } from "vue-router"
import {
  Search,
  Settings,
  Sun,
  Moon,
  Command,
  FolderPlus,
  Upload,
  LogOut,
  User,
} from "@lucide/vue"
import { useUIStore, type ThemeMode } from "@/stores/ui"
import { useAuthStore } from "@/stores/auth"
import { UPPY_KEY } from "@/modules/upload/composables/useVaultUpload"

const ui   = useUIStore()
const auth = useAuthStore()

const mode    = computed(() => ui.theme)
const setMode = (m: typeof ui.theme) => ui.setTheme(m)
const user    = computed(() => auth.user)
const router = useRouter()
const query = ref("")
const dropdownOpen = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Inject the active uppy instance provided by the FileList's useVaultUpload
const activeUppy = inject(UPPY_KEY, ref(null))

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !activeUppy.value) return
  const files = Array.from(input.files).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    data: file,
  }))
  activeUppy.value.addFiles(files)
  input.value = ""
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown() {
  dropdownOpen.value = false
}

const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
]

async function handleSignOut() {
  await auth.signOut()
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
        <!-- Hidden file input wired to the active uppy instance -->
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="sr-only"
          @change="onFilesSelected"
        />
        <button
          type="button"
          @click="openFilePicker"
          :disabled="!activeUppy"
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload :size="15" :stroke-width="2" />
          Upload
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)]"
          type="button"
        >
          <FolderPlus :size="15" :stroke-width="2" />
          New folder
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

      <!-- Avatar + dropdown -->
      <div class="relative">
        <button
          type="button"
          aria-label="Account"
          @click="toggleDropdown"
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

        <!-- Dropdown menu -->
        <div
          v-if="dropdownOpen"
          v-click-outside="closeDropdown"
          class="absolute right-0 top-12 z-50 min-w-48 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg"
        >
          <!-- User info -->
          <div class="border-b border-[var(--color-border)] px-4 py-3">
            <p class="text-sm font-medium">{{ user?.email }}</p>
          </div>

          <!-- Nav items -->
          <div class="p-1">
            <button
              type="button"
              @click="() => { router.push('/profile'); closeDropdown() }"
              class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition hover:bg-[var(--color-muted)]"
            >
              <User :size="15" :stroke-width="2" />
              Profile
            </button>
            <button
              type="button"
              @click="() => { router.push('/settings'); closeDropdown() }"
              class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition hover:bg-[var(--color-muted)]"
            >
              <Settings :size="15" :stroke-width="2" />
              Settings
            </button>
          </div>

          <!-- Sign out -->
          <div class="border-t border-[var(--color-border)] p-1">
            <button
              type="button"
              @click="handleSignOut"
              class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-destructive transition hover:bg-[var(--color-muted)]"
            >
              <LogOut :size="15" :stroke-width="2" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
