import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@contract': fileURLToPath(new URL('../src/application/views/contract.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': process.env['API_URL'] ?? 'http://localhost:3000' },
    fs: { allow: ['..'] },
  },
});
