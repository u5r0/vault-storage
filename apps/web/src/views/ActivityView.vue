<script setup lang="ts">
import { ref, computed } from "vue"
import { useRouter } from "vue-router"
import {
  ArrowLeft,
  Filter,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  Share2,
  Star,
  Tag,
  Clock,
  FileText,
  Folder,
} from "@lucide/vue"

const router = useRouter()

type ActivityType = "upload" | "create-folder" | "download" | "delete" | "share" | "star" | "tag"
type ActivityFilter = "all" | ActivityType

const selectedFilter = ref<ActivityFilter>("all")

const activities = ref([
  {
    id: "1",
    type: "upload" as ActivityType,
    itemName: "presentation.pptx",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    size: "2.4 MB",
  },
  {
    id: "2",
    type: "create-folder" as ActivityType,
    itemName: "Q4 Reports",
    itemType: "folder",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "3",
    type: "download" as ActivityType,
    itemName: "budget.xlsx",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    size: "1.2 MB",
  },
  {
    id: "4",
    type: "star" as ActivityType,
    itemName: "important-doc.pdf",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    size: "4.8 MB",
  },
  {
    id: "5",
    type: "upload" as ActivityType,
    itemName: "photo.jpg",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    size: "3.1 MB",
  },
  {
    id: "6",
    type: "delete" as ActivityType,
    itemName: "old-notes.txt",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    size: "12 KB",
  },
  {
    id: "7",
    type: "share" as ActivityType,
    itemName: "project-folder",
    itemType: "folder",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
  },
  {
    id: "8",
    type: "tag" as ActivityType,
    itemName: "meeting-notes.md",
    itemType: "file",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    size: "45 KB",
  },
])

const filters: { id: ActivityFilter; label: string; icon: any }[] = [
  { id: "all", label: "All", icon: Clock },
  { id: "upload", label: "Uploads", icon: Upload },
  { id: "create-folder", label: "Folders", icon: FolderPlus },
  { id: "download", label: "Downloads", icon: Download },
  { id: "delete", label: "Deletes", icon: Trash2 },
  { id: "share", label: "Shares", icon: Share2 },
  { id: "star", label: "Stars", icon: Star },
  { id: "tag", label: "Tags", icon: Tag },
]

const filteredActivities = computed(() => {
  if (selectedFilter.value === "all") return activities.value
  return activities.value.filter((a) => a.type === selectedFilter.value)
})

function getActivityIcon(type: ActivityType) {
  const icons: Record<ActivityType, any> = {
    upload: Upload,
    "create-folder": FolderPlus,
    download: Download,
    delete: Trash2,
    share: Share2,
    star: Star,
    tag: Tag,
  }
  return icons[type]
}

function getActivityColor(type: ActivityType) {
  const colors: Record<ActivityType, string> = {
    upload: "text-emerald-500",
    "create-folder": "text-blue-500",
    download: "text-purple-500",
    delete: "text-red-500",
    share: "text-amber-500",
    star: "text-yellow-500",
    tag: "text-pink-500",
  }
  return colors[type]
}

function getActivityLabel(type: ActivityType) {
  const labels: Record<ActivityType, string> = {
    upload: "Uploaded",
    "create-folder": "Created folder",
    download: "Downloaded",
    delete: "Deleted",
    share: "Shared",
    star: "Starred",
    tag: "Tagged",
  }
  return labels[type]
}

function formatTimeAgo(date: Date) {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function handleBack() {
  router.back()
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
        <h1 class="text-lg font-semibold">Activity Log</h1>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 px-4 py-6 md:px-6">
      <div class="mx-auto max-w-4xl">
        <!-- Filters -->
        <div
          class="mb-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2"
        >
          <button
            v-for="filter in filters"
            :key="filter.id"
            type="button"
            @click="selectedFilter = filter.id"
            :class="[
              'flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition',
              selectedFilter === filter.id
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-muted-foreground hover:bg-[var(--color-muted)] hover:text-foreground',
            ]"
          >
            <component :is="filter.icon" :size="14" :stroke-width="2" />
            {{ filter.label }}
          </button>
        </div>

        <!-- Activity List -->
        <div
          v-if="filteredActivities.length > 0"
          class="space-y-3"
        >
          <div
            v-for="activity in filteredActivities"
            :key="activity.id"
            class="flex items-start gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:bg-[var(--color-muted)]/30"
          >
            <!-- Icon -->
            <div
              :class="[
                'grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)]',
                getActivityColor(activity.type),
              ]"
            >
              <component
                :is="getActivityIcon(activity.type)"
                :size="18"
                :stroke-width="2"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium">
                  {{ getActivityLabel(activity.type) }}
                </p>
                <span
                  :class="[
                    'flex items-center gap-1 text-xs text-muted-foreground',
                    activity.itemType === 'folder' ? '' : '',
                  ]"
                >
                  <FileText v-if="activity.itemType === 'file'" :size="12" :stroke-width="2" />
                  <Folder v-else :size="12" :stroke-width="2" />
                  {{ activity.itemName }}
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ formatTimeAgo(activity.timestamp) }}
                <span v-if="activity.size" class="ml-2">· {{ activity.size }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else
          class="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-12"
        >
          <Clock :size="48" :stroke-width="1.5" class="text-muted-foreground/50" />
          <p class="mt-4 text-sm font-medium">No activity found</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ selectedFilter === 'all' ? 'Your activity will appear here' : `No ${selectedFilter} activity recorded` }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
