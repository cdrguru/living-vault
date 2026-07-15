import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const swaCohost = process.env.VITE_SWA_COHOST === 'true';

// The public repo cannot ship a .env (the export engine hard-denies the
// filename), so its dev script runs `vite --mode public` and this define
// raises the same VITE_PUBLIC_BUILD flag the public build script sets.
export default defineConfig(({ mode }) => ({
  base: swaCohost ? '/demo/' : '/',
  define:
    mode === 'public' || process.env.VITE_PUBLIC_BUILD === 'true'
      ? { 'import.meta.env.VITE_PUBLIC_BUILD': JSON.stringify('true') }
      : {},
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: swaCohost ? 'dist/demo' : 'dist',
    target: 'es2022',
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
}));
