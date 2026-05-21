<script setup lang="ts">
import { ref } from "vue"
import { Camera, Mail, Calendar, User, Save, MapPin, Briefcase } from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import { useSettingsStore } from "@/stores/settings"

const auth     = useAuthStore()
const settings = useSettingsStore()

const isEditing = ref(false)
const loading   = ref(false)

// Local edit buffer — only committed on save
const draft = ref({ ...settings.account })

function startEdit() {
  draft.value = { ...settings.account }
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
}

async function handleSave() {
  loading.value = true
  try {
    // TODO: wire to API when profile endpoint exists
    await new Promise((r) => setTimeout(r, 600))
    Object.assign(settings.account, draft.value)
    isEditing.value = false
  } finally {
    loading.value = false
  }
}

const initials = () =>
  (settings.account.name || auth.userEmail || "U").charAt(0).toUpperCase()
</script>

<template>
  <main class="flex-1 overflow-y-auto px-4 py-8 md:px-8">
    <div class="mx-auto max-w-3xl space-y-6">

      <!-- Profile card -->
      <div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 grain">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-start">

          <!-- Avatar -->
          <div class="relative shrink-0">
            <div
              class="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] ring-4 ring-[var(--color-border)]"
            >
              <span class="text-3xl font-bold text-[var(--color-primary-foreground)]">
                {{ initials() }}
              </span>
            </div>
            <button
              type="button"
              aria-label="Change avatar"
              class="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-md transition hover:opacity-90"
            >
              <Camera :size="14" :stroke-width="2" />
            </button>
          </div>

          <!-- Info / edit form -->
          <div class="flex-1">
            <!-- View mode -->
            <template v-if="!isEditing">
              <h2 class="text-xl font-semibold">{{ settings.account.name || "—" }}</h2>
              <p class="mt-0.5 text-sm text-muted-foreground">{{ auth.userEmail }}</p>
              <p v-if="settings.account.bio" class="mt-3 text-sm">{{ settings.account.bio }}</p>
              <div v-if="settings.account.location || settings.account.company" class="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span v-if="settings.account.location" class="flex items-center gap-1.5">
                  <MapPin :size="13" :stroke-width="2" /> {{ settings.account.location }}
                </span>
                <span v-if="settings.account.company" class="flex items-center gap-1.5">
                  <Briefcase :size="13" :stroke-width="2" /> {{ settings.account.company }}
                </span>
              </div>
            </template>

            <!-- Edit mode -->
            <template v-else>
              <div class="space-y-4">
                <div class="space-y-1.5">
                  <label class="block text-sm font-medium">Display name</label>
                  <v-input v-model="draft.name" placeholder="Your name" />
                </div>
                <div class="space-y-1.5">
                  <label class="block text-sm font-medium">Bio</label>
                  <textarea
                    v-model="draft.bio"
                    rows="3"
                    placeholder="Tell us about yourself…"
                    class="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                  />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="block text-sm font-medium">Location</label>
                    <v-input v-model="draft.location" placeholder="City, Country" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="block text-sm font-medium">Company</label>
                    <v-input v-model="draft.company" placeholder="Your company" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Actions -->
            <div class="mt-5 flex gap-3">
              <v-button v-if="!isEditing" variant="outline" @click="startEdit">Edit profile</v-button>
              <template v-else>
                <v-button variant="outline" @click="cancelEdit">Cancel</v-button>
                <v-button :loading="loading" @click="handleSave">
                  <Save :size="14" :stroke-width="2" /> Save
                </v-button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Account details -->
      <div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h3 class="mb-4 text-base font-semibold">Account details</h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
            <div class="flex items-center gap-3">
              <Mail :size="16" :stroke-width="2" class="text-muted-foreground" />
              <div>
                <p class="text-sm font-medium">Email address</p>
                <p class="text-xs text-muted-foreground">{{ auth.userEmail }}</p>
              </div>
            </div>
            <v-badge variant="primary">Verified</v-badge>
          </div>

          <div class="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
            <Calendar :size="16" :stroke-width="2" class="text-muted-foreground" />
            <div>
              <p class="text-sm font-medium">Member since</p>
              <p class="text-xs text-muted-foreground">
                {{ auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—" }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
            <div class="flex items-center gap-3">
              <User :size="16" :stroke-width="2" class="text-muted-foreground" />
              <div>
                <p class="text-sm font-medium">Account type</p>
                <p class="text-xs text-muted-foreground">Personal</p>
              </div>
            </div>
            <v-badge variant="accent">Free</v-badge>
          </div>
        </div>
      </div>

    </div>
  </main>
</template>
