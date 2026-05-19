import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import FilesView from "./views/FilesView.vue"

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/contents" },
  { path: "/contents/:entityId?", name: "content", component: FilesView, props: true },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * Helpers to translate between route state and app state.
 * Entity ID is a route param (applies to both folders and files).
 */
export function routeToEntityId(entityId: unknown): string | null {
  if (!entityId || entityId === "root") return null
  return entityId as string
}
