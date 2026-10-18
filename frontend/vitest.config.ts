import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/testing/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/app/routeTree.gen.ts'] },
    },
  }),
)
