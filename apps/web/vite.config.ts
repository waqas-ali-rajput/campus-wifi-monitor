import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@campus/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') } },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
