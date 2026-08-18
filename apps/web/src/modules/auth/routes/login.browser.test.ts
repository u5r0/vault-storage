import { describe, it, expect, vi } from "vitest"

import LoginRoute from "./login.vue"
import { authRoutes } from "../index"
import { mountWithRouter } from "@/__test__/mount"
import { useAuthStore } from "@/stores/auth"

/**
 * Browser smoke tests for the login route's cold-start DX (no full-screen
 * block while the serverless API warms up):
 *  - the form renders immediately (it never awaits /auth/me),
 *  - typing creds triggers a background auth check (warming the instance),
 *  - a late session confirmation on a pristine form continues to /contents.
 */

const routes = [
  ...authRoutes,
  { path: "/contents", name: "content", component: { template: "<div>vault</div>" } },
]

const fullUser = {
  id: "u1",
  email: "a@b.c",
  name: null,
  verified: true,
  lockedUntil: null,
  createdAt: "2026-01-01",
}

describe("/login route", () => {
  it("renders the form immediately without waiting on the auth check", async () => {
    const { utils } = await mountWithRouter(LoginRoute, { url: "/login", routes })

    await expect.element(utils.getByPlaceholder("you@example.com")).toBeVisible()
    await expect.element(utils.getByRole("button", { name: /sign in/i })).toBeVisible()
  })

  it("fires a background auth check while the user types", async () => {
    const auth = useAuthStore()
    auth.isInitializing = false
    const checkSpy = vi.spyOn(auth, "checkAuth").mockResolvedValue(undefined)

    const { utils } = await mountWithRouter(LoginRoute, { url: "/login", routes })
    await utils.getByPlaceholder("you@example.com").fill("a@b.c")

    await vi.waitFor(() => expect(checkSpy).toHaveBeenCalled(), { timeout: 2000 })
  })

  it("continues to the vault when a late session check confirms auth on a pristine form", async () => {
    const auth = useAuthStore()

    const { router } = await mountWithRouter(LoginRoute, { url: "/login", routes })

    auth.user = fullUser

    await vi.waitFor(
      () => expect(router.currentRoute.value.name).toBe("content"),
      { timeout: 2000 },
    )
  })

  it("does not yank the user away once they have started typing", async () => {
    const auth = useAuthStore()

    const { router, utils } = await mountWithRouter(LoginRoute, { url: "/login", routes })
    await utils.getByPlaceholder("you@example.com").fill("a@b.c")

    auth.user = fullUser

    // Give any (incorrect) redirect a chance to fire, then assert it didn't.
    await new Promise((r) => setTimeout(r, 100))
    expect(router.currentRoute.value.name).toBe("login")
  })
})
