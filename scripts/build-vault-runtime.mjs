import { build } from 'esbuild';
import { resolve } from 'node:path';

const builds = [
  {
    entry: resolve('src/vault/runtime.password.ts'),
    outfile: resolve('src/vault/runtime.password.bundle.js')
  },
  {
    entry: resolve('src/vault/runtime.shamir.ts'),
    outfile: resolve('src/vault/runtime.shamir.bundle.js')
  }
];

await Promise.all(
  builds.map(({ entry, outfile }) =>
    build({
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
    }).then(() => {
      console.log(`Vault runtime bundled to ${outfile}`);
    })
  )
);
