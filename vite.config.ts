import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  assetsInclude: ['**/*.wasm', '**/*.wasm?inline'],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
}));
