<script setup lang="ts">
import { ref, watch } from "vue"
import { Folder, X } from "@lucide/vue"

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [name: string]
}>()

const folderName = ref("")
const error = ref("")

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    folderName.value = ""
    error.value = ""
  }
})

function handleSubmit() {
  const name = folderName.value.trim()
  
  if (!name) {
    error.value = "Folder name is required"
    return
  }
  
  if (name.includes("/") || name.includes("\\")) {
    error.value = "Folder name cannot contain slashes"
    return
  }
  
  if (name === "." || name === "..") {
    error.value = "Invalid folder name"
    return
  }
  
  if (name.length > 255) {
    error.value = "Folder name is too long (max 255 characters)"
    return
  }
  
  emit("confirm", name)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault()
    handleSubmit()
  } else if (e.key === "Escape") {
    emit("close")
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="open"
            class="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_16px_48px_-16px_color-mix(in_oklch,var(--color-foreground)_12%,transparent)]"
            @keydown="handleKeydown"
          >
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <Folder :size="18" :stroke-width="2" />
                </div>
                <h2 class="text-base font-semibold">Create new folder</h2>
              </div>
              <button
                type="button"
                @click="emit('close')"
                class="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-[var(--color-muted)] hover:text-foreground"
                aria-label="Close"
              >
                <X :size="16" :stroke-width="2" />
              </button>
            </div>

            <!-- Body -->
            <div class="px-6 py-5">
              <div class="space-y-2">
                <label for="folder-name" class="block text-sm font-medium text-foreground">
                  Folder name
                </label>
                <input
                  id="folder-name"
                  ref="inputRef"
                  v-model="folderName"
                  type="text"
                  placeholder="My Folder"
                  class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm transition focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                  :class="error ? 'border-[var(--color-destructive)] focus:ring-[var(--color-destructive)]/30' : ''"
                  autofocus
                />
                <p v-if="error" class="text-[11px] text-[var(--color-destructive)]">
                  {{ error }}
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
              <button
                type="button"
                @click="emit('close')"
                class="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="handleSubmit"
                :disabled="!folderName.trim()"
                class="inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
