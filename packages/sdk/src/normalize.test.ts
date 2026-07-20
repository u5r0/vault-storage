import { describe, it, expect } from "vitest"
import { normalizeSearchText } from "./normalize"

/**
 * These tests pin the search-normalization contract (ADR 0028 §3.2). The
 * server persists `nameNormalized = normalizeSearchText(name)` and the client
 * normalizes the live query with the same function, so any drift here silently
 * breaks cross-side matching. Each group asserts that visually/linguistically
 * equivalent inputs collapse to one canonical form.
 */

describe("normalizeSearchText", () => {
  it("unifies all common alef forms to bare alef", () => {
    const forms = ["أحمد", "احمد", "ٱحمد", "آحمد", "إحمد"]
    const normalized = forms.map(normalizeSearchText)
    for (const n of normalized) {
      expect(n).toBe("احمد")
    }
  })

  it("strips tashkeel (harakat)", () => {
    expect(normalizeSearchText("مُحَمَّد")).toBe("محمد")
    expect(normalizeSearchText("كِتَاب")).toBe("كتاب")
  })

  it("strips tatweel / kashida", () => {
    expect(normalizeSearchText("محمـــد")).toBe("محمد")
  })

  it("folds Latin diacritics and lowercases", () => {
    expect(normalizeSearchText("Café")).toBe("cafe")
    expect(normalizeSearchText("CAFÉ")).toBe("cafe")
    expect(normalizeSearchText("Résumé")).toBe("resume")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeSearchText("  report.pdf  ")).toBe("report.pdf")
  })

  it("is idempotent (normalizing twice equals normalizing once)", () => {
    const inputs = ["أحمد", "Café", "مُحَمَّد", "Report Q1.xlsx"]
    for (const s of inputs) {
      const once = normalizeSearchText(s)
      expect(normalizeSearchText(once)).toBe(once)
    }
  })

  it("leaves already-plain ASCII unchanged apart from case", () => {
    expect(normalizeSearchText("Invoice-2026.pdf")).toBe("invoice-2026.pdf")
  })

  it("does NOT full-case-fold (ß stays ß — out of scope)", () => {
    // Documents the deliberate boundary: diacritics fold, letter
    // substitutions do not. Guards against accidental scope creep.
    expect(normalizeSearchText("Straße")).toBe("straße")
  })
})
