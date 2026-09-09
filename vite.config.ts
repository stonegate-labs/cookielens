import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^buffer$/, replacement: require.resolve('buffer/') }] },
  define: { global: 'globalThis' },
  build: { sourcemap: false, target: 'es2022' },
  server: { strictPort: true },
});
