import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The React app lives in web/. `bun run build:web` emits web/dist, which the Bun
// server serves in production. In dev (`bun run dev:web`) API + media calls are
// proxied to the backend on :3800.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': 'http://localhost:3800',
      '/media': 'http://localhost:3800',
    },
  },
});
