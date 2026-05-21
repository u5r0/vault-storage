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
]
