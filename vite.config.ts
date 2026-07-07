import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local dev without Vercel: `npm run dev:api` serves the api/ handlers here
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
