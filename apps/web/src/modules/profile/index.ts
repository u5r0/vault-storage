import type { RouteRecordRaw } from "vue-router"
import AppLayout from "@/layouts/AppLayout.vue"

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: "profile",
    component: () => import("./routes/profile.vue"),
    meta: { layout: AppLayout },
  },
]
