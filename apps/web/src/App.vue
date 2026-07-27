<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import AppLayout from "./layouts/AppLayout.vue"

const route = useRoute()

const Layout = computed(() => route.meta.layout ?? AppLayout)
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Layout">
      <component :is="Component" />
    </component>
  </RouterView>
</template>
