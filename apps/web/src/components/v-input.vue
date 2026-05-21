<script setup lang="ts">
defineProps<{
  modelValue?: string
  type?: string
  id?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  hasPrefix?: boolean
}>()

defineEmits<{ "update:modelValue": [value: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    :type="type ?? 'text'"
    :id="id"
    :placeholder="placeholder"
    :required="required"
    :disabled="disabled"
    :class="[
      'w-full rounded-[var(--radius-sm)] border border-[var(--color-border)]',
      'bg-[var(--color-background)] py-2.5 text-sm transition',
      'focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30',
      'disabled:cursor-not-allowed disabled:opacity-50',
      hasPrefix ? 'px-10' : 'px-3',
    ]"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
