import type { RouteRecordRaw } from "vue-router"
import AppLayout from "@/layouts/AppLayout.vue"

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: "/settings",
    name: "settings",
    component: () => import("./routes/settings.vue"),
    meta: { layout: AppLayout },
  },
]
