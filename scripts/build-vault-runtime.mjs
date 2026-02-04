import { build } from 'esbuild';
import { resolve } from 'node:path';

const entry = resolve('src/vault/runtime.ts');
const outfile = resolve('src/vault/runtime.bundle.js');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: false,
  loader: {
    '.wasm': 'dataurl'
  }
});

console.log(`Vault runtime bundled to ${outfile}`);
