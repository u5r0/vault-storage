<script setup lang="ts">
import { ref } from "vue"
import {
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  HardDrive,
  Trash2,
  ChevronRight,
  Moon,
  Sun,
  Check,
} from "@lucide/vue"
import { useTheme, type ThemeMode } from "@/composables/useTheme"

const { mode, setMode } = useTheme()

const activeSection = ref("account")

const settingsSections = [
  { id: "account", label: "Account", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
]

const accountSettings = ref({
  email: "demo@vault.app",
  name: "Demo User",
})

const notificationSettings = ref({
  emailNotifications: true,
  pushNotifications: false,
  uploadAlerts: true,
  shareAlerts: true,
})

const securitySettings = ref({
  twoFactorEnabled: false,
  loginAlerts: true,
  sessionTimeout: "30",
})

const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
]

const storageInfo = ref({
  used: 2.4,
  total: 15,
  files: 147,
})

function saveSettings() {
  // TODO: Implement actual save
  console.log("Settings saved")
}
</script>

<template>
  <main class="flex-1 overflow-y-auto px-4 py-6 md:px-6">
      <div class="mx-auto max-w-4xl">
        <div class="flex flex-col gap-6 lg:flex-row">
          <!-- Sidebar Navigation -->
          <aside class="lg:w-64 shrink-0">
            <nav
              class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:sticky lg:top-24"
            >
              <button
                v-for="section in settingsSections"
                :key="section.id"
                type="button"
                @click="activeSection = section.id"
                :class="[
                  'flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition',
                  activeSection === section.id
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'text-muted-foreground hover:bg-[var(--color-muted)] hover:text-foreground',
                ]"
              >
                <div class="flex items-center gap-3">
                  <component :is="section.icon" :size="16" :stroke-width="2" />
                  {{ section.label }}
                </div>
                <ChevronRight :size="14" :stroke-width="2" class="opacity-50" />
              </button>
            </nav>
          </aside>

          <!-- Settings Content -->
          <div class="flex-1 gap-2">
            <!-- Account Settings -->
              <div
                v-if="activeSection === 'account'"
                class="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <h2 class="mb-4 text-lg font-semibold">Account Information</h2>
                <div class="space-y-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-medium">Email Address</label>
                    <input
                      v-model="accountSettings.email"
                      type="email"
                      disabled
                      class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm opacity-60"
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-medium">Display Name</label>
                    <input
                      v-model="accountSettings.name"
                      type="text"
                      class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                    />
                  </div>
                </div>
              </div>

            <!-- Notification Settings -->
            <div
              v-if="activeSection === 'notifications'"
              class="space-y-6"
            >
              <div
                class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <h2 class="mb-4 text-lg font-semibold">Notification Preferences</h2>
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Email Notifications</p>
                      <p class="text-xs text-muted-foreground">Receive updates via email</p>
                    </div>
                    <button
                      type="button"
                      @click="notificationSettings.emailNotifications = !notificationSettings.emailNotifications"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        notificationSettings.emailNotifications
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          notificationSettings.emailNotifications ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Push Notifications</p>
                      <p class="text-xs text-muted-foreground">Browser push notifications</p>
                    </div>
                    <button
                      type="button"
                      @click="notificationSettings.pushNotifications = !notificationSettings.pushNotifications"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        notificationSettings.pushNotifications
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          notificationSettings.pushNotifications ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Upload Alerts</p>
                      <p class="text-xs text-muted-foreground">Notify when files are uploaded</p>
                    </div>
                    <button
                      type="button"
                      @click="notificationSettings.uploadAlerts = !notificationSettings.uploadAlerts"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        notificationSettings.uploadAlerts
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          notificationSettings.uploadAlerts ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Share Alerts</p>
                      <p class="text-xs text-muted-foreground">Notify when files are shared</p>
                    </div>
                    <button
                      type="button"
                      @click="notificationSettings.shareAlerts = !notificationSettings.shareAlerts"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        notificationSettings.shareAlerts
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          notificationSettings.shareAlerts ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Security Settings -->
            <div
              v-if="activeSection === 'security'"
              class="space-y-6"
            >
              <div
                class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <h2 class="mb-4 text-lg font-semibold">Security</h2>
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Two-Factor Authentication</p>
                      <p class="text-xs text-muted-foreground">Add an extra layer of security</p>
                    </div>
                    <button
                      type="button"
                      @click="securitySettings.twoFactorEnabled = !securitySettings.twoFactorEnabled"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        securitySettings.twoFactorEnabled
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          securitySettings.twoFactorEnabled ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Login Alerts</p>
                      <p class="text-xs text-muted-foreground">Notify of new sign-ins</p>
                    </div>
                    <button
                      type="button"
                      @click="securitySettings.loginAlerts = !securitySettings.loginAlerts"
                      :class="[
                        'relative h-6 w-11 rounded-full transition-colors',
                        securitySettings.loginAlerts
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-muted)]',
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          securitySettings.loginAlerts ? 'translate-x-5' : 'translate-x-0.5',
                        ]"
                      />
                    </button>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-medium">Session Timeout (minutes)</label>
                    <input
                      v-model="securitySettings.sessionTimeout"
                      type="number"
                      class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Appearance Settings -->
            <div
              v-if="activeSection === 'appearance'"
              class="space-y-6"
            >
              <div
                class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <h2 class="mb-4 text-lg font-semibold">Appearance</h2>
                <div class="space-y-4">
                  <div>
                    <label class="mb-3 block text-sm font-medium">Theme</label>
                    <div class="flex gap-2">
                      <button
                        v-for="t in themes"
                        :key="t.id"
                        type="button"
                        @click="setMode(t.id)"
                        :class="[
                          'flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium transition',
                          mode === t.id
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                            : 'border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]',
                        ]"
                      >
                        <component :is="t.icon" :size="16" :stroke-width="2" />
                        {{ t.label }}
                        <Check
                          v-if="mode === t.id"
                          :size="14"
                          :stroke-width="2.5"
                          class="ml-auto"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Storage Settings -->
            <div
              v-if="activeSection === 'storage'"
              class="space-y-6"
            >
              <div
                class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <h2 class="mb-4 text-lg font-semibold">Storage Usage</h2>
                <div class="mb-4">
                  <div class="mb-2 flex items-center justify-between text-sm">
                    <span class="font-medium">{{ storageInfo.used }} GB used</span>
                    <span class="text-muted-foreground">of {{ storageInfo.total }} GB</span>
                  </div>
                  <div class="h-2 rounded-full bg-[var(--color-muted)]">
                    <div
                      class="h-full rounded-full bg-[var(--color-primary)] transition-all"
                      :style="{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
                    <p class="text-2xl font-semibold">{{ storageInfo.files }}</p>
                    <p class="text-xs text-muted-foreground">Total files</p>
                  </div>
                  <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
                    <p class="text-2xl font-semibold">{{ storageInfo.total - storageInfo.used }} GB</p>
                    <p class="text-xs text-muted-foreground">Available</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Danger Zone -->
            <div
              v-if="activeSection === 'danger'"
              class="space-y-6"
            >
              <div
                class="rounded-[var(--radius-lg)] border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/5 p-6"
              >
                <h2 class="mb-4 text-lg font-semibold text-[var(--color-destructive)]">Danger Zone</h2>
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">Delete Account</p>
                      <p class="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                    <button
                      type="button"
                      class="rounded-[var(--radius-sm)] border border-[var(--color-destructive)] bg-[var(--color-destructive)] px-4 py-2 text-sm font-medium text-[var(--color-destructive-foreground)] transition hover:opacity-90"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Save Button -->
            <div
              v-if="activeSection !== 'danger'"
              class="flex justify-end"
            >
              <button
                type="button"
                @click="saveSettings"
                class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
              >
                <Check :size="16" :stroke-width="2" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
  </main>
</template>
