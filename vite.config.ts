import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Optional: set VITE_HMR_HOST to your LAN IP when testing on devices (e.g., 192.168.x.x)
const hmrHost = process.env.VITE_HMR_HOST

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Build targets:
  // - "cap" (Capacitor): relative paths
  // - "web" (WordPress subfolder): absolute base like /sorcery/
  const buildTarget = env.VITE_BUILD_TARGET || 'cap'

  const base =
    buildTarget === 'web'
      ? (env.VITE_WEB_BASE || '/') // must end with trailing slash
      : './'

  return {
    plugins: [react()],
    base,

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      host: true,
      port: 5173,
      strictPort: true,
      hmr: {
        protocol: 'ws',
        port: 5173,
        ...(hmrHost ? { host: hmrHost } : {}),
      },
    },

    build: {
      target: 'es2018',
      sourcemap: false,
    },
  }
})
