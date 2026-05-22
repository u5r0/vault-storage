import type { RouteRecordRaw } from "vue-router"
import AccountLayout from "@/layouts/AccountLayout.vue"

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: "/settings",
    name: "settings",
    component: () => import("./routes/settings.vue"),
    meta: { layout: AccountLayout },
  },
]
