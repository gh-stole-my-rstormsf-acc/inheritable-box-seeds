import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve('dist');
const indexPath = resolve(distDir, 'index.html');

const html = await readFile(indexPath, 'utf8');
const cssMatch = html.match(/<link[^>]+href="([^\"]+assets\/[^\"]+\.css)"[^>]*>/);
const jsMatch = html.match(/<script[^>]+src="([^\"]+assets\/[^\"]+\.js)"[^>]*><\/script>/);

if (!cssMatch || !jsMatch) {
  throw new Error('Could not locate CSS/JS assets to inline.');
}

const normalizeAssetPath = (assetPath) => assetPath.replace(/^.*?(assets\/)/, '$1');
const cssPath = resolve(distDir, normalizeAssetPath(cssMatch[1]));
const jsPath = resolve(distDir, normalizeAssetPath(jsMatch[1]));

const [css, js] = await Promise.all([
  readFile(cssPath, 'utf8'),
  readFile(jsPath, 'utf8')
]);

const inlined = html
  .replace(cssMatch[0], `<style>${css}</style>`)
  .replace(jsMatch[0], `<script>${js}</script>`);

const outPath = resolve(distDir, 'seed-vault.html');
await writeFile(outPath, inlined, 'utf8');
await writeFile(indexPath, inlined, 'utf8');

console.log(`Inlined assets into ${outPath}`);
