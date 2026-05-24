import { describe, it, expect, vi } from "vitest"

import VerifyRoute from "./verify.vue"
import { authRoutes } from "../index"
import { mountWithRouter } from "@/__test__/mount"
import { useAuthStore } from "@/stores/auth"

/**
 * Browser-mode smoke tests for the /verify route per ADR 0019 §D1 / §E3.
 *
 * Mocks the auth store's network actions and asserts on user-visible
 * behavior: the loading indicator, the success transition that navigates to
 * /contents, and the error path with a working resend control.
 */

const routes = [
  ...authRoutes,
  // Success path replaces() to /contents — give the router somewhere to land
  // that doesn't pull in the rest of the app.
  { path: "/contents", name: "content", component: { template: "<div>vault</div>" } },
]

describe("/verify route", () => {
  it("missing token → renders an error message and a resend form", async () => {
    const { utils } = await mountWithRouter(VerifyRoute, {
      url: "/verify",
      routes,
    })

    await expect.element(utils.getByText(/missing verification token/i)).toBeVisible()
    await expect.element(utils.getByPlaceholder("you@example.com")).toBeVisible()
  })

  it("valid token → navigates to /contents after success", async () => {
    const auth = useAuthStore()
    const verifySpy = vi.spyOn(auth, "verifyToken").mockResolvedValue({ user: {} } as any)

    const { router } = await mountWithRouter(VerifyRoute, {
      url: "/verify?token=valid-token",
      routes,
    })

    // Component schedules router.replace("/contents") 600ms after success.
    await vi.waitFor(
      () => {
        expect(router.currentRoute.value.fullPath).toBe("/contents")
      },
      { timeout: 2000 },
    )

    expect(verifySpy).toHaveBeenCalledWith("valid-token")
  })

  it("invalid token → shows the error and lets the user resend", async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, "verifyToken").mockRejectedValue(new Error("This link has expired."))
    const resendSpy = vi
      .spyOn(auth, "resendVerification")
      .mockResolvedValue({ ok: true } as any)

    const { utils } = await mountWithRouter(VerifyRoute, {
      url: "/verify?token=expired",
      routes,
    })

    await expect.element(utils.getByText(/this link has expired/i)).toBeVisible()

    await utils.getByPlaceholder("you@example.com").fill("user@example.com")
    await utils.getByRole("button", { name: /resend verification/i }).click()

    expect(resendSpy).toHaveBeenCalledWith("user@example.com")
    await expect.element(utils.getByText(/check your inbox/i)).toBeVisible()
  })
})
