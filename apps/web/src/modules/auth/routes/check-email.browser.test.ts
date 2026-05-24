import { describe, it, expect, vi } from "vitest"

import CheckEmailRoute from "./check-email.vue"
import { authRoutes } from "../index"
import { mountWithRouter } from "@/__test__/mount"
import { useAuthStore } from "@/stores/auth"

/**
 * Browser-mode smoke tests for the /check-email route per ADR 0019 §D2 / §E3.
 */

const routes = [
  ...authRoutes,
  { path: "/contents", name: "content", component: { template: "<div>vault</div>" } },
]

describe("/check-email route", () => {
  it("renders the email from the route query", async () => {
    const { utils } = await mountWithRouter(CheckEmailRoute, {
      url: "/check-email?email=jane%40example.com",
      routes,
    })
    await expect.element(utils.getByText("jane@example.com")).toBeVisible()
  })

  it("falls back to a generic message when no email is in the query", async () => {
    const { utils } = await mountWithRouter(CheckEmailRoute, {
      url: "/check-email",
      routes,
    })
    // Exact match avoids colliding with the H1 "Check your email".
    await expect.element(utils.getByText("your email", { exact: true })).toBeVisible()
  })

  it("clicking Resend calls auth.resendVerification and starts the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
    try {
      const auth = useAuthStore()
      const resendSpy = vi
        .spyOn(auth, "resendVerification")
        .mockResolvedValue({ ok: true } as any)

      const { utils } = await mountWithRouter(CheckEmailRoute, {
        url: "/check-email?email=u@x.com",
        routes,
      })

      await utils.getByRole("button", { name: /resend verification email/i }).click()

      expect(resendSpy).toHaveBeenCalledWith("u@x.com")

      // After click the button label flips to a countdown and is disabled.
      await expect.element(utils.getByText(/resend in \d+s/i)).toBeVisible()
      await expect.element(utils.getByRole("button", { name: /resend in/i })).toBeDisabled()

      // Drain the cooldown.
      vi.advanceTimersByTime(31_000)
      await expect
        .element(utils.getByRole("button", { name: /resend verification email/i }))
        .toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
