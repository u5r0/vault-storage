<script setup lang="ts">
import {
  User, Bell, Shield, Palette, HardDrive, Trash2, ChevronRight,
} from "@lucide/vue"

const props = defineProps<{ active: string }>()
const emit = defineEmits<{ "update:active": [id: string] }>()

const sections = [
  { id: "account",       label: "Account",       icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security",      label: "Security",      icon: Shield },
  { id: "appearance",    label: "Appearance",    icon: Palette },
  { id: "storage",       label: "Storage",       icon: HardDrive },
  { id: "danger",        label: "Danger Zone",   icon: Trash2 },
]
</script>

<template>
  <nav
    class="flex flex-col gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2 lg:sticky lg:top-24"
    aria-label="Settings sections"
  >
    <button
      v-for="s in sections"
      :key="s.id"
      type="button"
      @click="emit('update:active', s.id)"
      :class="[
        'flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition',
        active === s.id
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'text-muted-foreground hover:bg-[var(--color-muted)] hover:text-foreground',
      ]"
    >
      <span class="flex items-center gap-3">
        <component :is="s.icon" :size="15" :stroke-width="2" />
        {{ s.label }}
      </span>
      <ChevronRight :size="13" :stroke-width="2" class="opacity-40" />
    </button>
  </nav>
</template>
