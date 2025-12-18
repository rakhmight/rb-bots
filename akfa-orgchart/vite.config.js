import { defineConfig } from 'vite'

const host = process.env.VITE_HOST || '127.0.0.1'
const port = Number(process.env.VITE_PORT || 5173)

export default defineConfig({
  server: { host, port, strictPort: true },
  preview:{ host, port: 4173, strictPort: true }
})
