<script setup lang="ts">
import AppLayout from "./layouts/AppLayout.vue"
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="(route.meta.layout as any) ?? AppLayout">
      <component :is="Component" />
    </component>
  </RouterView>
</template>
