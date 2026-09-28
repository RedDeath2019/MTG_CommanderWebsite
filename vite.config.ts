import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: { 'import.meta.env.MODE': JSON.stringify(mode) },
  plugins: [react()],
}))
