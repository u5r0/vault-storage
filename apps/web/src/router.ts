import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import FilesView from "./views/FilesView.vue"

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/files" },
  { path: "/files/:path(.*)*", name: "files", component: FilesView },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * Helpers to translate between route state and app state.
 * Folder path is a route param; selected file path is a query param.
 */
export function routeToCurrentPath(rawPath: unknown): string {
  if (Array.isArray(rawPath)) return rawPath.join("/")
  return (rawPath as string) || ""
}
