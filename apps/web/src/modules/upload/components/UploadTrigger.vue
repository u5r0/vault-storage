<script setup lang="ts">
import type { Uppy } from "@uppy/core"
import { computed } from "vue"

const props = defineProps<{
  uppy: Uppy
}>()

// Uppy doesn't expose a reactive state, so we derive uploading status
// from the files list passed down by useVaultUpload.
const isUploading = computed(() =>
  props.uppy.getFiles().some((f) => f.progress?.uploadStarted && !f.progress?.uploadComplete),
)

function upload() {
  props.uppy.upload()
}
</script>

<template>
  <v-button
    variant="primary"
    size="sm"
    :loading="isUploading"
    :disabled="isUploading"
    @click="upload"
  >
    {{ isUploading ? "Uploading…" : "Upload" }}
  </v-button>
</template>
