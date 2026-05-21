<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { client } from "@/lib/client"
import { routeToEntityId } from "@/router"
import { useFilesStore } from "@/stores/files"
import { useFiles } from "../composables/useFiles"
import FileList from "../components/FileList.vue"
import DetailsPanel from "../components/DetailsPanel.vue"
import FolderModal from "../components/FolderModal.vue"

const route  = useRoute()
const router = useRouter()
const filesStore = useFilesStore()

const currentEntityId = computed(() => routeToEntityId(route.params.entityId))
const selectedId      = computed(() => (route.query.selected as string) || null)

const { entries, loading, error, refresh } = useFiles(currentEntityId)

const selectedFile = computed(
  () => entries.value.find((e) => e.id === selectedId.value) ?? null,
)

const folderModalOpen = ref(false)

// Handle folder creation triggered from AppHeader drawer
watch(() => filesStore.createFolderRequested, async (name) => {
  if (!name) return
  await createFolder(name)
  filesStore.clearCreateFolderRequest()
})

function handleSelect(id: string) {
  const entry = entries.value.find((e) => e.id === id)
  if (entry?.type === "folder") {
    router.push({ name: "content", params: { entityId: id } })
  } else {
    router.push({
      name: "content",
      params: { entityId: currentEntityId.value ?? undefined },
      query: { selected: id },
    })
  }
}

function navigateTo(entityId: string | null) {
  router.push({ name: "content", params: entityId ? { entityId } : {} })
}

async function createFolder(name: string) {
  try {
    await client.createFolder({ parentId: currentEntityId.value ?? null, name })
    folderModalOpen.value = false
    await refresh()
  } catch (err) {
    console.error("Failed to create folder:", err)
  }
}
</script>

<template>
  <main class="flex flex-1 overflow-hidden">
    <div v-if="loading" class="grid flex-1 place-items-center text-muted-foreground text-sm">
      <v-spinner />
    </div>
    <div v-else-if="error" class="grid flex-1 place-items-center text-destructive text-sm">
      {{ error.message }}
    </div>
    <FileList
      v-else
      :files="entries"
      :selected-id="selectedId ?? ''"
      :current-entity-id="currentEntityId ?? ''"
      @select="handleSelect"
      @navigate="navigateTo"
      @upload-complete="refresh"
      @create-folder="folderModalOpen = true"    />
    <DetailsPanel :file="selectedFile" />
    <FolderModal
      :open="folderModalOpen"
      @close="folderModalOpen = false"
      @confirm="createFolder"
    />
  </main>
</template>
