import { defineConfig } from 'vite'
import process from 'node:process'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1431 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    // Local browser preview: avoid CORS on api.tools (Tauri still uses TOOLS_API_DEFAULT).
    proxy: {
      '/tools-api': {
        target: 'https://api.tools.ai-forall.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tools-api/, ''),
      },
    },
  },
})
