import { describe, it, expect } from "vitest"
import { normalizePath, toPrefix, joinName, isSafeName, FOLDER_KEEP } from "./paths"

describe("normalizePath", () => {
  it("returns empty string for nullish input", () => {
    expect(normalizePath(undefined)).toBe("")
    expect(normalizePath(null)).toBe("")
    expect(normalizePath("")).toBe("")
  })

  it("strips leading and trailing slashes", () => {
    expect(normalizePath("/Movies/")).toBe("Movies")
    expect(normalizePath("///a/b///")).toBe("a/b")
  })

  it("collapses internal empty segments", () => {
    expect(normalizePath("a//b")).toBe("a/b")
  })

  it("normalises backslashes to forward slashes", () => {
    expect(normalizePath("a\\b\\c")).toBe("a/b/c")
  })

  it("trims whitespace inside segments", () => {
    expect(normalizePath(" a / b ")).toBe("a/b")
  })

  it("drops segments that are pure whitespace", () => {
    expect(normalizePath("a/   /b")).toBe("a/b")
  })
})

describe("toPrefix", () => {
  it("returns empty string for empty path (root)", () => {
    expect(toPrefix("")).toBe("")
    expect(toPrefix("/")).toBe("")
  })

  it("appends trailing slash for non-empty paths", () => {
    expect(toPrefix("Movies")).toBe("Movies/")
    expect(toPrefix("a/b")).toBe("a/b/")
  })

  it("normalises before adding slash", () => {
    expect(toPrefix("/Movies/Action/")).toBe("Movies/Action/")
  })
})

describe("joinName", () => {
  it("joins prefix and name", () => {
    expect(joinName("Movies/", "movie.mp4")).toBe("Movies/movie.mp4")
  })

  it("works with empty (root) prefix", () => {
    expect(joinName("", "file.txt")).toBe("file.txt")
  })

  it("strips leading/trailing slashes from name", () => {
    expect(joinName("a/", "/b/")).toBe("a/b")
  })
})

describe("isSafeName", () => {
  it("accepts simple names", () => {
    expect(isSafeName("movie.mp4")).toBe(true)
    expect(isSafeName("résumé.pdf")).toBe(true)
    expect(isSafeName("a")).toBe(true)
  })

  it("rejects empty strings and overly long names", () => {
    expect(isSafeName("")).toBe(false)
    expect(isSafeName("a".repeat(256))).toBe(false)
  })

  it("rejects names with path separators", () => {
    expect(isSafeName("a/b")).toBe(false)
    expect(isSafeName("a\\b")).toBe(false)
  })

  it("rejects names with control characters", () => {
    expect(isSafeName("a\x00b")).toBe(false)
    expect(isSafeName("a\nb")).toBe(false)
  })

  it("rejects . and ..", () => {
    expect(isSafeName(".")).toBe(false)
    expect(isSafeName("..")).toBe(false)
  })

  it("accepts dotfiles other than . and ..", () => {
    expect(isSafeName(".env")).toBe(true)
    expect(isSafeName(FOLDER_KEEP)).toBe(true)
  })
})
