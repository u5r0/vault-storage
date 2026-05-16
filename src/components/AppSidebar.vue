<script setup lang="ts">
import { ref } from "vue"
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Star,
  Clock,
  Trash2,
  Tag,
  HardDrive,
} from "lucide-vue-next"
const sidebarTree = [
  { id: "", name: "Root" },
  { id: "Movies", name: "Movies" },
  { id: "Pictures", name: "Pictures" },
  { id: "Documents", name: "Documents" },
]

const props = defineProps<{ activeId: string }>()
const emit = defineEmits<{ (e: "select", id: string): void }>()

const expanded = ref<Record<string, boolean>>({})
function toggle(id: string) {
  expanded.value[id] = !expanded.value[id]
}

const quickLinks = [
  { id: "starred", name: "Starred", icon: Star, count: 12 },
  { id: "recent", name: "Recent", icon: Clock, count: 24 },
  { id: "tags", name: "Tags", icon: Tag, count: 8 },
  { id: "trash", name: "Trash", icon: Trash2, count: 3 },
]

const usedGB = 624
const totalGB = 1200
</script>

<template>
  <aside
    class="hidden h-full w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-5 md:flex"
  >
    <!-- My files header -->
    <div class="px-2">
      <div class="mb-3 flex items-center gap-2">
        <span
          class="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        >
          <FolderOpen :size="15" :stroke-width="2" />
        </span>
        <h2 class="text-[15px] font-semibold tracking-tight">My files</h2>
      </div>

      <ul class="flex flex-col gap-0.5">
        <li v-for="folder in sidebarTree" :key="folder.id">
          <button
            type="button"
            @click="
              () => {
                toggle(folder.id)
                emit('select', folder.id)
              }
            "
            :class="[
              'group flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-[13.5px] transition',
              props.activeId === folder.id
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                : 'text-foreground/85 hover:bg-[var(--color-muted)]',
            ]"
          >
            <ChevronRight
              :size="14"
              :stroke-width="2.25"
              :class="[
                'shrink-0 transition-transform',
                expanded[folder.id] ? 'rotate-90' : '',
                props.activeId === folder.id
                  ? 'text-[var(--color-primary)]'
                  : 'text-muted-foreground',
              ]"
            />
            <Folder
              :size="16"
              :stroke-width="1.75"
              :class="
                props.activeId === folder.id
                  ? 'text-[var(--color-primary)]'
                  : 'text-muted-foreground group-hover:text-foreground'
              "
            />
            <span class="truncate">{{ folder.name }}</span>
          </button>
        </li>
      </ul>
    </div>

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
