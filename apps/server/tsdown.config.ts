import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/__setup__',
  ],
  unbundle: true,
  target: 'es2022',
  clean: true,
  dts: false,
  outExtensions() {
    return { js: '.js' }
  },
})
