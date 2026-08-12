import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  unbundle: true,
  target: 'es2022',
  clean: true,
  outExtensions() {
    return { js: '.js', dts: '.d.ts' }
  },
})
