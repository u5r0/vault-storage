import type { RouteRecordRaw } from "vue-router"
import AuthLayout from "@/layouts/AuthLayout.vue"

export const authRoutes: RouteRecordRaw[] = [
  { path: "/login",           name: "login",           component: () => import("./routes/login.vue"),           meta: { layout: AuthLayout } },
  { path: "/signup",          name: "signup",          component: () => import("./routes/signup.vue"),          meta: { layout: AuthLayout } },
  { path: "/forgot-password", name: "forgot-password", component: () => import("./routes/forgot-password.vue"), meta: { layout: AuthLayout } },
  { path: "/reset-password",  name: "reset-password",  component: () => import("./routes/reset-password.vue"),  meta: { layout: AuthLayout } },
  { path: "/verify",          name: "verify",          component: () => import("./routes/login.vue"),           meta: { layout: AuthLayout } },
]
