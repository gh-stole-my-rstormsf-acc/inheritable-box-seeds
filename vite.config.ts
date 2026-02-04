import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wasm', '**/*.wasm?inline'],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
