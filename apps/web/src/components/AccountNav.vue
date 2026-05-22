<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  UserCircle, User, Bell, Shield, Palette, FolderOpen,
  HardDrive, Trash2, ChevronRight,
} from "@lucide/vue"

const route  = useRoute()
const router = useRouter()

type LinkItem =
  | { kind: "route"; id: string; label: string; icon: any; routeName: string }
  | { kind: "section"; id: string; label: string; icon: any }

const groups: Array<{ heading?: string; items: LinkItem[] }> = [
  {
    heading: "You",
    items: [
      { kind: "route", id: "profile", label: "Profile", icon: UserCircle, routeName: "profile" },
      { kind: "section", id: "account",       label: "Account",       icon: User },
      { kind: "section", id: "notifications", label: "Notifications", icon: Bell },
      { kind: "section", id: "security",      label: "Security",      icon: Shield },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { kind: "section", id: "appearance", label: "Appearance", icon: Palette },
      { kind: "section", id: "files",      label: "Files",      icon: FolderOpen },
      { kind: "section", id: "storage",    label: "Storage",    icon: HardDrive },
    ],
  },
  {
    items: [
      { kind: "section", id: "danger", label: "Danger Zone", icon: Trash2 },
    ],
  },
]

const activeId = computed<string>(() => {
  if (route.name === "profile") return "profile"
  const section = (route.query.section as string) || "account"
  return section
})

function go(item: LinkItem) {
  if (item.kind === "route") {
    router.push({ name: item.routeName })
  } else {
    router.push({ name: "settings", query: { section: item.id } })
  }
}
</script>

<template>
  <nav
    aria-label="Account navigation"
    class="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start"
  >
    <div v-for="(group, gi) in groups" :key="gi" class="flex flex-col gap-1">
      <p
        v-if="group.heading"
        class="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80"
      >
        {{ group.heading }}
      </p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in group.items" :key="item.id">
          <button
            type="button"
            @click="go(item)"
            :aria-current="activeId === item.id ? 'page' : undefined"
            :class="[
              'group flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] font-medium transition',
              activeId === item.id
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                : 'text-muted-foreground hover:bg-[var(--color-muted)]/60 hover:text-foreground',
            ]"
          >
            <span class="flex min-w-0 items-center gap-2.5">
              <component
                :is="item.icon"
                :size="15"
                :stroke-width="1.85"
                :class="activeId === item.id ? 'text-[var(--color-primary)]' : 'text-muted-foreground/85 group-hover:text-foreground'"
              />
              <span class="truncate">{{ item.label }}</span>
            </span>
            <ChevronRight
              :size="13"
              :stroke-width="2"
              :class="[
                'shrink-0 transition',
                activeId === item.id ? 'opacity-70' : 'opacity-0 group-hover:opacity-50',
              ]"
            />
          </button>
        </li>
      </ul>
    </div>
  </nav>
</template>
