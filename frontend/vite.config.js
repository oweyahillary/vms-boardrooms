import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app is the single logged-in app, served by the Express backend
// at /app. It builds straight into ../public/app so the single service
// serves it as static files (same origin -> relative /api calls).
// (Formerly /boardrooms — /boardrooms and /admin now redirect here.)
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  // Dev only: `npm run dev` serves on :5173 with hot reload and proxies
  // API calls to the backend on :3000 so relative /api/... paths work.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
