import { readFile, writeFile, readdir } from 'node:fs/promises';
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

const assetsDir = resolve(distDir, 'assets');
const assetFiles = await readdir(assetsDir);
let inlinedJs = js;
for (const file of assetFiles) {
  if (!file.includes('.worker') || !file.endsWith('.js')) continue;
  inlinedJs = inlinedJs.replaceAll(
    `new URL("${file}",import.meta.url)`,
    `new URL("./assets/${file}",import.meta.url)`
  );
}

const inlined = html
  .replace(cssMatch[0], `<style>${css}</style>`)
  .replace(jsMatch[0], `<script type="module">${inlinedJs}</script>`);

const outPath = resolve(distDir, 'seed-vault.html');
await writeFile(outPath, inlined, 'utf8');
await writeFile(indexPath, inlined, 'utf8');

console.log(`Inlined assets into ${outPath}`);
