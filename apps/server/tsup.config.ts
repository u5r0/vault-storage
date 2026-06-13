import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  // Don't bundle native/binary deps — they stay in node_modules at runtime
  external: ["argon2"],
  // Resolve workspace packages (e.g. @vault/sdk) by inlining their TS source
  noExternal: ["@vault/sdk"],
})
