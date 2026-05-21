<script setup lang="ts">
import { ref, computed, inject } from "vue"
import { useRouter } from "vue-router"
import {
  Search, Settings, Sun, Moon, Command,
  FolderPlus, Upload, LogOut, User, X, Folder,
} from "@lucide/vue"
import { useUIStore, type ThemeMode } from "@/stores/ui"
import { useAuthStore } from "@/stores/auth"
import { useFilesStore } from "@/stores/files"
import { UPPY_KEY } from "@/modules/upload/composables/useVaultUpload"

const ui    = useUIStore()
const auth  = useAuthStore()
const files = useFilesStore()
const router = useRouter()

const mode    = computed(() => ui.theme)
const user    = computed(() => auth.user)

// ── Upload ────────────────────────────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const activeUppy   = inject(UPPY_KEY, ref(null))

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !activeUppy.value) return
  activeUppy.value.addFiles(
    Array.from(input.files).map((f) => ({ name: f.name, type: f.type, size: f.size, data: f })),
  )
  input.value = ""
}

// ── New folder drawer ─────────────────────────────────────────────────────────
const drawerOpen  = ref(false)
const folderName  = ref("")
const folderError = ref("")

function openDrawer() {
  folderName.value  = ""
  folderError.value = ""
  drawerOpen.value  = true
}

function closeDrawer() {
  drawerOpen.value = false
}

function handleDrawerKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeDrawer()
}

function submitFolder() {
  const name = folderName.value.trim()
  if (!name) { folderError.value = "Name is required"; return }
  if (name.includes("/") || name.includes("\\")) { folderError.value = "Name cannot contain slashes"; return }
  if (name.length > 255) { folderError.value = "Name is too long"; return }
  files.requestCreateFolder(name)
  closeDrawer()
}

// ── User dropdown ─────────────────────────────────────────────────────────────
const dropdownOpen  = ref(false)
const avatarBtnRef  = ref<HTMLButtonElement | null>(null)

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown() {
  dropdownOpen.value = false
}

function navigate(path: string) {
  router.push(path)
  closeDropdown()
}

async function handleSignOut() {
  closeDropdown()
  await auth.signOut()
  router.push("/login")
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun,  label: "Light" },
  { id: "dark",  icon: Moon, label: "Dark"  },
]

const query = ref("")
</script>

<template>
  <header class="sticky top-0 z-30 w-full border-b border-[var(--color-border)] glass">
    <div class="flex h-16 items-center gap-3 px-4 md:px-6">

      <!-- Brand -->
      <RouterLink to="/contents" class="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 transition hover:bg-[var(--color-muted)]">
        <span class="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--color-primary)_60%,transparent)]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
            <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.379a2 2 0 0 1 1.414.586l1.207 1.207A2 2 0 0 0 12.914 7.4H18.5A2.5 2.5 0 0 1 21 9.9v6.6A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
          </svg>
        </span>
        <div class="hidden flex-col leading-tight sm:flex">
          <span class="text-sm font-semibold tracking-tight">Vault</span>
          <span class="text-[11px] text-muted-foreground">Personal</span>
        </div>
      </RouterLink>

      <!-- Search -->
      <div class="ml-2 flex-1">
        <label class="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 px-3.5 py-2.5 text-sm transition focus-within:border-[var(--color-ring)] focus-within:bg-[var(--color-card)] focus-within:ring-2 focus-within:ring-[var(--color-ring)]/30">
          <Search :size="16" class="shrink-0 text-muted-foreground" :stroke-width="2" />
          <input v-model="query" type="text" placeholder="Search files, folders, and tags…" class="w-full bg-transparent text-sm placeholder:text-muted-foreground/80 focus:outline-none" />
          <span class="hidden items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
            <Command :size="11" :stroke-width="2.5" /> K
          </span>
        </label>
      </div>

      <!-- Actions (md+) -->
      <div class="flex items-center gap-1.5">
        <!-- Hidden file input -->
        <input ref="fileInputRef" type="file" multiple class="sr-only" @change="onFilesSelected" />

        <!-- Upload — primary -->
        <button
          type="button"
          @click="openFilePicker"
          class="hidden items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 md:inline-flex"
          :class="{ 'opacity-40 cursor-not-allowed': !activeUppy }"
          :aria-disabled="!activeUppy"
        >
          <Upload :size="15" :stroke-width="2" />
          Upload
        </button>

        <!-- New folder — outline -->
        <button
          type="button"
          @click="openDrawer"
          class="hidden items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)] md:inline-flex"
        >
          <FolderPlus :size="15" :stroke-width="2" />
          New folder
        </button>
      </div>

      <!-- Theme toggle -->
      <div role="radiogroup" aria-label="Theme" class="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/60 p-1">
        <button
          v-for="t in themes" :key="t.id"
          type="button" role="radio"
          :aria-checked="mode === t.id" :aria-label="t.label"
          @click="ui.setTheme(t.id)"
          :class="['grid h-7 w-8 place-items-center rounded-[var(--radius-xs)] transition', mode === t.id ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground']"
        >
          <component :is="t.icon" :size="14" :stroke-width="2.25" />
        </button>
      </div>

      <!-- Avatar -->
      <div class="relative">
        <button
          ref="avatarBtnRef"
          type="button"
          aria-label="Account menu"
          :aria-expanded="dropdownOpen"
          @click.stop="toggleDropdown"
          class="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full ring-2 ring-[var(--color-border)] transition hover:ring-[var(--color-primary)]"
        >
          <span class="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-sm font-semibold text-[var(--color-primary-foreground)]">
            {{ user?.email?.charAt(0).toUpperCase() ?? "U" }}
          </span>
          <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--color-background)]" aria-hidden="true" />
        </button>

        <!-- Dropdown -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 -translate-y-1"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 -translate-y-1"
        >
          <div
            v-if="dropdownOpen"
            v-click-outside="closeDropdown"
            class="absolute right-0 top-[calc(100%+8px)] z-50 w-52 origin-top-right rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_8px_32px_-8px_color-mix(in_oklch,var(--color-foreground)_12%,transparent)]"
          >
            <div class="border-b border-[var(--color-border)] px-4 py-3">
              <p class="truncate text-sm font-medium">{{ user?.email }}</p>
            </div>
            <div class="p-1">
              <button type="button" @click="navigate('/profile')" class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition hover:bg-[var(--color-muted)]">
                <User :size="15" :stroke-width="2" class="text-muted-foreground" /> Profile
              </button>
              <button type="button" @click="navigate('/settings')" class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition hover:bg-[var(--color-muted)]">
                <Settings :size="15" :stroke-width="2" class="text-muted-foreground" /> Settings
              </button>
            </div>
            <div class="border-t border-[var(--color-border)] p-1">
              <button type="button" @click="handleSignOut" class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-destructive)] transition hover:bg-[var(--color-muted)]">
                <LogOut :size="15" :stroke-width="2" /> Sign out
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </header>

  <!-- New folder drawer (slides in from top of content area) -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="drawerOpen" class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" @click="closeDrawer" />
    </Transition>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <div
        v-if="drawerOpen"
        class="fixed left-1/2 top-20 z-50 w-full max-w-sm -translate-x-1/2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_16px_48px_-16px_color-mix(in_oklch,var(--color-foreground)_14%,transparent)]"
        @keydown="handleDrawerKeydown"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <Folder :size="16" :stroke-width="2" />
            </span>
            <h2 class="text-sm font-semibold">New folder</h2>
          </div>
          <button type="button" @click="closeDrawer" aria-label="Close" class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-foreground">
            <X :size="15" :stroke-width="2" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-5 py-4">
          <label for="drawer-folder-name" class="mb-1.5 block text-sm font-medium">Folder name</label>
          <v-input
            id="drawer-folder-name"
            v-model="folderName"
            placeholder="My folder"
            autofocus
            @keydown.enter="submitFolder"
            @keydown.esc="closeDrawer"
          />
          <p v-if="folderError" class="mt-1.5 text-[11px] text-[var(--color-destructive)]">{{ folderError }}</p>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <v-button variant="outline" size="sm" @click="closeDrawer">Cancel</v-button>
          <v-button size="sm" :disabled="!folderName.trim()" @click="submitFolder">Create</v-button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
