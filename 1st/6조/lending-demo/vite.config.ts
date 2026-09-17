import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages serves the site under /<repo>/, so the CI workflow sets VITE_BASE to that
// path. Local dev and other hosts keep the default '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
