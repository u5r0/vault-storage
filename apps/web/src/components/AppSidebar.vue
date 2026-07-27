<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import {
  FolderOpen,
  Star,
  Clock,
  Trash2,
  Tag,
  HardDrive,
} from "@lucide/vue"
import { client } from "@/lib/client"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()

const quickLinks = ref([
  { id: "starred", name: "Starred", icon: Star, count: 0 },
  { id: "recent", name: "Recent", icon: Clock, count: 0 },
  { id: "tags", name: "Tags", icon: Tag, count: 0 },
  { id: "trash", name: "Trash", icon: Trash2, count: 0 },
])

const usedGB = 624
const totalGB = 1200

async function loadQuickLinks() {
  try {
    const data = await client.getQuickLinks()
    quickLinks.value[0].count = data.starred
    quickLinks.value[1].count = data.recent
    quickLinks.value[2].count = data.tags
    quickLinks.value[3].count = data.trash
  } catch (err) {
    console.error("Failed to load quick links:", err)
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await loadQuickLinks()
  }
})

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      loadQuickLinks()
    }
  },
)
</script>

<template>
  <aside
    class="hidden h-full w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-5 md:flex"
  >
    <!-- Quick links -->
    <div class="px-2">
      <h3
        class="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Library
      </h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="link in quickLinks" :key="link.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-[13.5px] text-foreground/85 transition hover:bg-[var(--color-muted)]"
          >
            <component
              :is="link.icon"
              :size="15"
              :stroke-width="1.75"
              class="text-muted-foreground"
            />
            <span class="flex-1 truncate">{{ link.name }}</span>
            <span
              class="rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {{ link.count }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Storage card -->
    <div class="mt-auto px-2">
      <div
        class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-3.5"
      >
        <div class="mb-2.5 flex items-center gap-2">
          <span
            class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          >
            <HardDrive :size="14" :stroke-width="2" />
          </span>
          <div class="flex flex-1 items-baseline justify-between">
            <span class="text-[13px] font-medium">Storage</span>
            <span class="text-[11px] text-muted-foreground">
              {{ usedGB }} / {{ totalGB }} GB
            </span>
          </div>
        </div>
        <div
          class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]"
        >
          <div
            class="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"
            :style="{ width: `${(usedGB / totalGB) * 100}%` }"
          />
        </div>
        <button
          type="button"
          class="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--color-muted)]"
        >
          Upgrade plan
        </button>
      </div>
    </div>
  </aside>
</template>
