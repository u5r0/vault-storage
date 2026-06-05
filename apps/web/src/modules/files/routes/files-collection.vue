<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useQueryClient } from "@tanstack/vue-query"
import { routeToEntityId } from "@/router"
import { useUploadStore } from "@/stores/upload"
import { useFiles } from "../composables/useFiles"
import { useCreateFolder } from "../composables/useFileMutations"
import { filesKeys } from "../lib/queryKeys"
import FileList from "../components/FileList.vue"
import DetailsPanel from "../components/DetailsPanel.vue"
import FolderModal from "../components/FolderModal.vue"

const route        = useRoute()
const router       = useRouter()
const uploadStore  = useUploadStore()
const queryClient  = useQueryClient()

const currentEntityId = computed(() => routeToEntityId(route.params.entityId))
const selectedId      = computed(() => (route.query.selected as string) || null)

const {
  entries,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useFiles(() => currentEntityId.value)

const selectedFile = computed(
  () => entries.value.find((e) => e.id === selectedId.value) ?? null,
)

const folderModalOpen = ref(false)

const {
  mutate: createFolderMutate,
  isPending: isCreatingFolder,
  error: createFolderError,
} = useCreateFolder(() => currentEntityId.value)

function createFolder(name: string) {
  createFolderMutate(name, {
    onSuccess: () => { folderModalOpen.value = false },
  })
}

watch(
  () => uploadStore.lastCompletedAt,
  (val, prev) => {
    if (val && val !== prev) {
      queryClient.invalidateQueries({
        queryKey: filesKeys.list(currentEntityId.value),
      })
    }
  },
)

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
</script>

<template>
  <main class="flex flex-1 overflow-hidden">
    <div v-if="isLoading" class="grid flex-1 place-items-center text-muted-foreground text-sm">
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
      :has-next-page="!!hasNextPage"
      :is-fetching-next-page="!!isFetchingNextPage"
      @select="handleSelect"
      @navigate="navigateTo"
      @load-more="fetchNextPage"
      @create-folder="folderModalOpen = true"
    />
    <DetailsPanel :file="selectedFile" />
    <FolderModal
      :open="folderModalOpen"
      :is-pending="isCreatingFolder"
      :server-error="createFolderError?.message ?? null"
      @close="folderModalOpen = false"
      @confirm="createFolder"
    />
  </main>
</template>
