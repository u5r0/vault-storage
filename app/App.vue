<script setup lang="ts">
import { computed, ref } from "vue"
import AppHeader from "./components/AppHeader.vue"
import AppSidebar from "./components/AppSidebar.vue"
import FileList from "./components/FileList.vue"
import DetailsPanel from "./components/DetailsPanel.vue"
import { useFiles } from "./composables/useFiles"
import { useTheme } from "./composables/useTheme"

useTheme()

const currentPath = ref("")
const selectedPath = ref<string | null>(null)

const { entries, loading, error } = useFiles(currentPath)

const selectedFile = computed(
  () => entries.value.find((e) => e.path === selectedPath.value) ?? null,
)
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader />
    <main class="flex flex-1 overflow-hidden">
      <AppSidebar :active-id="currentPath" @select="currentPath = $event" />
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
        @select="selectedPath = $event"
      />
      <DetailsPanel :file="selectedFile" />
    </main>
  </div>
</template>
