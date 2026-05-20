<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import {
  User,
  Mail,
  Calendar,
  MapPin,
  Briefcase,
  Camera,
  Save,
  ArrowLeft,
} from "@lucide/vue"
import { useAuth } from "@/composables/useAuth"

const router = useRouter()
const { user } = useAuth()

const name = ref("Demo User")
const email = ref(user.value?.email || "demo@vault.app")
const bio = ref("")
const location = ref("")
const website = ref("")
const company = ref("")
const avatarUrl = ref("")
const isEditing = ref(false)
const loading = ref(false)

function handleBack() {
  router.back()
}

async function handleSave() {
  loading.value = true
  try {
    // TODO: Implement actual profile update API
    await new Promise(resolve => setTimeout(resolve, 1000))
    isEditing.value = false
  } catch (err) {
    console.error("Failed to save profile:", err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- Header -->
    <header
      class="sticky top-0 z-30 w-full border-b border-[var(--color-border)] glass"
    >
      <div class="flex h-16 items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          @click="handleBack"
          class="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-foreground"
        >
          <ArrowLeft :size="18" :stroke-width="1.75" />
        </button>
        <h1 class="text-lg font-semibold">Profile</h1>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 px-4 py-8 md:px-6">
      <div class="mx-auto max-w-3xl">
        <!-- Profile Header -->
        <div
          class="mb-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
        >
          <div class="flex flex-col gap-6 sm:flex-row sm:items-start">
            <!-- Avatar -->
            <div class="relative">
              <div
                class="grid h-24 w-24 place-items-center overflow-hidden rounded-full ring-4 ring-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]"
              >
                <span class="text-3xl font-bold text-[var(--color-primary-foreground)]">
                  {{ name.charAt(0).toUpperCase() }}
                </span>
              </div>
              <button
                type="button"
                class="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg transition hover:opacity-90"
              >
                <Camera :size="14" :stroke-width="2" />
              </button>
            </div>

            <!-- User Info -->
            <div class="flex-1">
              <div v-if="!isEditing">
                <h2 class="text-2xl font-semibold">{{ name }}</h2>
                <p class="mt-1 text-sm text-muted-foreground">{{ email }}</p>
                <p v-if="bio" class="mt-3 text-sm">{{ bio }}</p>
                <div v-if="location || company" class="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span v-if="location" class="flex items-center gap-1.5">
                    <MapPin :size="14" :stroke-width="2" />
                    {{ location }}
                  </span>
                  <span v-if="company" class="flex items-center gap-1.5">
                    <Briefcase :size="14" :stroke-width="2" />
                    {{ company }}
                  </span>
                </div>
              </div>
              <div v-else class="space-y-4">
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Name</label>
                  <input
                    v-model="name"
                    type="text"
                    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Email</label>
                  <input
                    v-model="email"
                    type="email"
                    disabled
                    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm opacity-60"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Bio</label>
                  <textarea
                    v-model="bio"
                    rows="3"
                    placeholder="Tell us about yourself..."
                    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30 resize-none"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Location</label>
                  <input
                    v-model="location"
                    type="text"
                    placeholder="City, Country"
                    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Company</label>
                  <input
                    v-model="company"
                    type="text"
                    placeholder="Your company"
                    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                  />
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="mt-6 flex gap-3">
                <button
                  v-if="!isEditing"
                  type="button"
                  @click="isEditing = true"
                  class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
                >
                  Edit Profile
                </button>
                <template v-else>
                  <button
                    type="button"
                    @click="isEditing = false"
                    class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    @click="handleSave"
                    :disabled="loading"
                    class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Save :size="16" :stroke-width="2" />
                    {{ loading ? "Saving..." : "Save" }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Account Details -->
        <div
          class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
        >
          <h3 class="mb-4 text-lg font-semibold">Account Details</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
              <div class="flex items-center gap-3">
                <Mail :size="18" :stroke-width="2" class="text-muted-foreground" />
                <div>
                  <p class="text-sm font-medium">Email Address</p>
                  <p class="text-xs text-muted-foreground">{{ email }}</p>
                </div>
              </div>
              <span class="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)]">
                Verified
              </span>
            </div>
            <div class="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
              <div class="flex items-center gap-3">
                <Calendar :size="18" :stroke-width="2" class="text-muted-foreground" />
                <div>
                  <p class="text-sm font-medium">Member Since</p>
                  <p class="text-xs text-muted-foreground">January 2026</p>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
              <div class="flex items-center gap-3">
                <User :size="18" :stroke-width="2" class="text-muted-foreground" />
                <div>
                  <p class="text-sm font-medium">Account Type</p>
                  <p class="text-xs text-muted-foreground">Personal</p>
                </div>
              </div>
              <span class="rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]">
                Free
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
