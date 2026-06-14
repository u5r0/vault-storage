import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Don't bundle native/binary deps — they stay in node_modules at runtime
  // Resolve workspace packages (e.g. @vault/sdk) by inlining their TS source
  deps: {
    neverBundle: ["argon2"],
    alwaysBundle: ["@vault/sdk"],
  },
  dts: false,
})
