<script setup lang="ts">
import { computed, ref } from "vue"
import AppHeader from "./components/AppHeader.vue"
import AppSidebar from "./components/AppSidebar.vue"
import FileList from "./components/FileList.vue"
import DetailsPanel from "./components/DetailsPanel.vue"
import { files } from "./data/files"
import { useTheme } from "./composables/useTheme"

useTheme() // initialize on mount

const selectedId = ref<string>("movies")
const activeFolder = ref<string>("movies")

const selectedFile = computed(
  () => files.find((f) => f.id === selectedId.value) ?? null,
)
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader />
    <main class="flex flex-1 overflow-hidden">
      <AppSidebar :active-id="activeFolder" @select="activeFolder = $event" />
      <FileList
        :files="files"
        :selected-id="selectedId"
        @select="selectedId = $event"
      />
      <DetailsPanel :file="selectedFile" />
    </main>
  </div>
</template>
