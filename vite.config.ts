import { defineConfig } from 'vite';

const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self';";
const PROD_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self';";

const replaceCsp = (html: string, content: string) =>
  html.replace(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+>/i,
    (meta) => meta.replace(/content="[^"]*"/i, `content="${content}"`)
  );

export default defineConfig(({ command }) => ({
  root: 'src',
  base: command === 'build' ? './' : '/',
  assetsInclude: ['**/*.wasm', '**/*.wasm?inline'],
  plugins: [
    {
      name: 'csp-transform',
      transformIndexHtml(html) {
        const csp = command === 'serve' ? DEV_CSP : PROD_CSP;
        return replaceCsp(html, csp);
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    rollupOptions: {
      inlineDynamicImports: true,
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
}));
