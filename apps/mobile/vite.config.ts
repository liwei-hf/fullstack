import { defineConfig } from 'vite'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const uni = require('@dcloudio/vite-plugin-uni').default

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3336,
    proxy: {
      '/api': {
        target: 'http://localhost:3334',
        changeOrigin: true,
      },
    },
  },
})
