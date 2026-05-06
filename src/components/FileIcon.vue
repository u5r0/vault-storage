<script setup lang="ts">
import { computed } from "vue"
import {
  Folder,
  FolderOpen,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  FileCode2,
  File as FileGeneric,
} from "lucide-vue-next"
import type { FileType } from "@/data/files"

const props = defineProps<{
  type: FileType
  open?: boolean
  size?: number
  tone?: "primary" | "muted"
}>()

const Icon = computed(() => {
  switch (props.type) {
    case "folder":
      return props.open ? FolderOpen : Folder
    case "image":
      return FileImage
    case "video":
      return FileVideo
    case "audio":
      return FileAudio
    case "document":
      return FileText
    case "archive":
      return FileArchive
    case "code":
      return FileCode2
    default:
      return FileGeneric
  }
})

const colorClass = computed(() =>
  props.tone === "primary"
    ? "text-[var(--color-primary)]"
    : "text-muted-foreground",
)
</script>

<template>
  <component
    :is="Icon"
    :size="size ?? 18"
    :stroke-width="1.75"
    :class="colorClass"
  />
</template>
