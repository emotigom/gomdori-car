import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_ORIGIN ?? 'http://localhost:8787';

// The on-device SQLite uses the OPFS "SAH pool" VFS, which needs no
// cross-origin isolation headers, so any static host (GitHub Pages, Vercel, S3) works.

// GitHub Pages serves the site from /<repo>/; the Pages workflow sets VITE_BASE.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { proxy: { '/api': API, '/sync': API, '/health': API } },
  preview: { proxy: { '/api': API, '/sync': API, '/health': API } },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
