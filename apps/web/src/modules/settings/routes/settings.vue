<script setup lang="ts">
import { ref } from "vue"
import { Sun, Moon, Check } from "@lucide/vue"
import { useUIStore } from "@/stores/ui"
import { useSettingsStore } from "@/stores/settings"
import { useAuthStore } from "@/stores/auth"
import SettingsSidebar from "../components/SettingsSidebar.vue"
import SettingsSection from "../components/SettingsSection.vue"
import ToggleSwitch from "../components/ToggleSwitch.vue"

const ui       = useUIStore()
const settings = useSettingsStore()
const auth     = useAuthStore()

const active = ref("account")

const themes = [
  { id: "light" as const, icon: Sun,  label: "Light" },
  { id: "dark"  as const, icon: Moon, label: "Dark"  },
]
</script>

<template>
  <main class="flex-1 overflow-y-auto px-4 py-8 md:px-8">
    <div class="mx-auto max-w-4xl">
      <h1 class="mb-6 text-xl font-semibold tracking-tight">Settings</h1>

      <div class="flex flex-col gap-6 lg:flex-row">
        <!-- Sidebar -->
        <aside class="shrink-0 lg:w-56">
          <SettingsSidebar v-model:active="active" />
        </aside>

        <!-- Content -->
        <div class="flex-1 space-y-4">

          <!-- Account -->
          <SettingsSection v-if="active === 'account'" title="Account">
            <div class="space-y-4">
              <div class="space-y-1.5">
                <label class="block text-sm font-medium">Email address</label>
                <v-input :model-value="auth.userEmail ?? ''" disabled />
                <p class="text-[11px] text-muted-foreground">Email cannot be changed.</p>
              </div>
              <div class="space-y-1.5">
                <label class="block text-sm font-medium">Display name</label>
                <v-input v-model="settings.account.name" placeholder="Your name" />
              </div>
            </div>
            <div class="mt-6 flex justify-end">
              <v-button>Save changes</v-button>
            </div>
          </SettingsSection>

          <!-- Notifications -->
          <SettingsSection v-if="active === 'notifications'" title="Notifications">
            <div class="space-y-5">
              <ToggleSwitch
                v-model="settings.notifications.emailNotifications"
                label="Email notifications"
                description="Receive updates and alerts via email"
              />
              <ToggleSwitch
                v-model="settings.notifications.pushNotifications"
                label="Push notifications"
                description="Browser push notifications"
              />
              <ToggleSwitch
                v-model="settings.notifications.uploadAlerts"
                label="Upload alerts"
                description="Notify when files finish uploading"
              />
              <ToggleSwitch
                v-model="settings.notifications.shareAlerts"
                label="Share alerts"
                description="Notify when files are shared with you"
              />
            </div>
            <div class="mt-6 flex justify-end">
              <v-button>Save changes</v-button>
            </div>
          </SettingsSection>

          <!-- Security -->
          <SettingsSection v-if="active === 'security'" title="Security">
            <div class="space-y-5">
              <ToggleSwitch
                v-model="settings.security.twoFactorEnabled"
                label="Two-factor authentication"
                description="Add an extra layer of security to your account"
              />
              <ToggleSwitch
                v-model="settings.security.loginAlerts"
                label="Login alerts"
                description="Get notified of new sign-ins"
              />
              <div class="space-y-1.5">
                <label class="block text-sm font-medium">Session timeout (minutes)</label>
                <v-input
                  :model-value="String(settings.security.sessionTimeout)"
                  type="number"
                  @update:model-value="settings.security.sessionTimeout = Number($event)"
                />
              </div>
            </div>
            <div class="mt-6 flex justify-end">
              <v-button>Save changes</v-button>
            </div>
          </SettingsSection>

          <!-- Appearance -->
          <SettingsSection v-if="active === 'appearance'" title="Appearance">
            <div class="space-y-3">
              <p class="text-sm font-medium">Theme</p>
              <div class="flex gap-3">
                <button
                  v-for="t in themes"
                  :key="t.id"
                  type="button"
                  @click="ui.setTheme(t.id)"
                  :class="[
                    'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium transition',
                    ui.theme === t.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]',
                  ]"
                >
                  <component :is="t.icon" :size="15" :stroke-width="2" />
                  {{ t.label }}
                  <Check v-if="ui.theme === t.id" :size="13" :stroke-width="2.5" class="ml-auto" />
                </button>
              </div>
            </div>
          </SettingsSection>

          <!-- Storage -->
          <SettingsSection v-if="active === 'storage'" title="Storage">
            <div class="mb-4">
              <div class="mb-2 flex items-baseline justify-between text-sm">
                <span class="font-medium">{{ settings.storage.used }} GB used</span>
                <span class="text-muted-foreground">of {{ settings.storage.total }} GB</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] transition-all"
                  :style="{ width: `${settings.storage.total ? (settings.storage.used / settings.storage.total) * 100 : 0}%` }"
                />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
                <p class="text-2xl font-semibold tabular-nums">{{ settings.storage.files }}</p>
                <p class="text-xs text-muted-foreground">Total files</p>
              </div>
              <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
                <p class="text-2xl font-semibold tabular-nums">{{ settings.storage.total - settings.storage.used }} GB</p>
                <p class="text-xs text-muted-foreground">Available</p>
              </div>
            </div>
          </SettingsSection>

          <!-- Danger zone -->
          <SettingsSection v-if="active === 'danger'" title="Danger Zone" :danger="true">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium">Delete account</p>
                <p class="text-xs text-muted-foreground">Permanently delete your account and all data. This cannot be undone.</p>
              </div>
              <v-button variant="outline" class="shrink-0 border-[var(--color-destructive)] text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                Delete account
              </v-button>
            </div>
          </SettingsSection>

        </div>
      </div>
    </div>
  </main>
</template>
