import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The client builds under `/app/`, where the web process serves it. `@tbn/contracts` resolves to
 * its TypeScript source, so the client always validates with the schemas the backend uses. The
 * world's models and manifests come in through `import.meta.glob`, so they ship hashed.
 */
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@tbn/contracts': source('../packages/contracts/src/index.ts'),
      '@': source('./src'),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // A model or a font stays a file whatever its size: the loader fetches it, and the page's content
    // security policy allows no data URLs.
    assetsInlineLimit: (file) => (/\.(glb|woff2)$/.test(file) ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    setupFiles: ['src/testing/setup.ts'],
  },
});
