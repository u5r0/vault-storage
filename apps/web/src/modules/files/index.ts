import type { RouteRecordRaw } from "vue-router"
import AppLayout from "@/layouts/AppLayout.vue"

export const filesRoutes: RouteRecordRaw[] = [
  {
    path: "/contents/:entityId?",
    name: "content",
    component: () => import("./routes/files-collection.vue"),
    props: true,
    meta: { layout: AppLayout },
  },
  {
    path: "/search",
    name: "search",
    component: () => import("./routes/search.vue"),
    meta: { layout: AppLayout },
  },
]
