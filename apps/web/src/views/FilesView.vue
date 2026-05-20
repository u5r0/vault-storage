<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSidebar from "../components/AppSidebar.vue";
import FileList from "../components/FileList.vue";
import DetailsPanel from "../components/DetailsPanel.vue";
import FolderModal from "../components/FolderModal.vue";
import { useFiles } from "../composables/useFiles";
import { routeToEntityId } from "../router";
import { client } from "@/lib/client";

const route = useRoute();
const router = useRouter();

const currentEntityId = computed(() => routeToEntityId(route.params.entityId));
const selectedId = computed(() => (route.query.selected as string) || null);

const { entries, loading, error, refresh } = useFiles(currentEntityId);

const selectedFile = computed(
  () => entries.value.find((e) => e.id === selectedId.value) ?? null,
);

const folderModalOpen = ref(false);

function handleSelect(id: string) {
  const entry = entries.value.find((e) => e.id === id);
  if (entry?.type === "folder") {
    router.push({ name: "content", params: { entityId: id } });
  } else {
    router.push({
      name: "content",
      params: { entityId: currentEntityId.value ?? undefined },
      query: { selected: id },
    });
  }
}

function navigateTo(entityId: string | null) {
  router.push({
    name: "content",
    params: entityId ? { entityId } : {},
  });
}

function handleCreateFolder() {
  folderModalOpen.value = true;
}

async function handleFolderConfirm(name: string) {
  try {
    await client.createFolder({
      parentId: currentEntityId.value ?? null,
      name,
    });
    folderModalOpen.value = false;
    await refresh();
  } catch (err) {
    console.error("Failed to create folder:", err);
  }
}
</script>

<template>
  <main class="flex flex-1 overflow-hidden">
    <AppSidebar />
    <div
      v-if="loading"
      class="grid flex-1 place-items-center text-muted-foreground text-sm"
    >
      Loading…
    </div>
    <div
      v-else-if="error"
      class="grid flex-1 place-items-center text-destructive text-sm"
    >
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
      @create-folder="handleCreateFolder"
    />
    <DetailsPanel :file="selectedFile" />
    <FolderModal
      :open="folderModalOpen"
      @close="folderModalOpen = false"
      @confirm="handleFolderConfirm"
    />
  </main>
</template>
