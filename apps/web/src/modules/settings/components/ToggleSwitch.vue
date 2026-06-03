<!-- Reusable accessible toggle used throughout settings sections -->
<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string; description?: string }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <div>
      <p class="text-sm font-medium">{{ label }}</p>
      <p v-if="description" class="text-xs text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      @click="$emit('update:modelValue', !modelValue)"
      :class="[
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
        modelValue ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted)]',
      ]"
    >
      <span
        :class="[
          'absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          modelValue ? 'translate-x-0.5' : 'translate-x-5',
        ]"
      />
    </button>
  </div>
</template>
