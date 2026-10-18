import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server passes /api to the Rust web server (DEV_API_PROXY), so the site can use the
// same-origin /api/v1 base as production and work from other devices without CORS changes.
const apiProxy = process.env.DEV_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [
    // Must come before react(): it generates src/app/routeTree.gen.ts from src/app/routes/.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    proxy: {
      // xfwd passes the browser's host along (X-Forwarded-Host): Steam sign-in compares it with
      // SERVER.PUBLIC_URL.
      '/api': { target: apiProxy, changeOrigin: true, xfwd: true },
    },
  },
})
