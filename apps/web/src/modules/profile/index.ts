import type { RouteRecordRaw } from "vue-router"
import AccountLayout from "@/layouts/AccountLayout.vue"

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: "profile",
    component: () => import("./routes/profile.vue"),
    meta: { layout: AccountLayout },
  },
]
