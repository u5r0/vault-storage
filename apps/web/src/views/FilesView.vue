<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppSidebar from "../components/AppSidebar.vue"
import FileList from "../components/FileList.vue"
import DetailsPanel from "../components/DetailsPanel.vue"
import { useFiles } from "../composables/useFiles"
import { routeToCurrentPath } from "../router"

const route = useRoute()
const router = useRouter()

const currentPath = computed(() => routeToCurrentPath(route.params.path))
const selectedPath = computed(() => (route.query.selected as string) || null)

const { entries, loading, error, refresh } = useFiles(currentPath)

const selectedFile = computed(
  () => entries.value.find((e) => e.path === selectedPath.value) ?? null,
)

function handleSelect(path: string) {
  const entry = entries.value.find((e) => e.path === path)
  if (entry?.type === "folder") {
    router.push({ name: "files", params: { path: path.split("/") } })
  } else {
    router.push({
      name: "files",
      params: { path: currentPath.value ? currentPath.value.split("/") : [] },
      query: { selected: path },
    })
  }
}

function navigateTo(path: string) {
  router.push({
    name: "files",
    params: { path: path ? path.split("/") : [] },
  })
}

function handleSidebarSelect(id: string) {
  navigateTo(id)
}

const breadcrumbs = computed(() => {
  if (!currentPath.value) return []
  const parts = currentPath.value.split("/")
  return parts.map((_, i) => ({
    name: parts[i],
    path: parts.slice(0, i + 1).join("/"),
  }))
})
</script>

<template>
  <main class="flex flex-1 overflow-hidden">
    <AppSidebar :active-id="currentPath" @select="handleSidebarSelect" />
    <div v-if="loading" class="grid flex-1 place-items-center text-muted-foreground text-sm">
      Loading…
    </div>
    <div v-else-if="error" class="grid flex-1 place-items-center text-destructive text-sm">
      {{ error.message }}
    </div>
    <FileList
      v-else
      :files="entries"
      :selected-path="selectedPath ?? ''"
      :current-path="currentPath"
      :breadcrumbs="breadcrumbs"
      @select="handleSelect"
      @navigate="navigateTo"
      @upload-complete="refresh"
    />
    <DetailsPanel :file="selectedFile" />
  </main>
</template>
