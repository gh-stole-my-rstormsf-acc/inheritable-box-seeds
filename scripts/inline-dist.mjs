import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

const withInlineScriptHashInCsp = (htmlString, scriptContent) => {
  const cspMetaPattern =
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]*)"[^>]*>/i;
  const cspMetaMatch = htmlString.match(cspMetaPattern);
  if (!cspMetaMatch) return htmlString;

  const hashToken = `'sha256-${createHash('sha256').update(scriptContent).digest('base64')}'`;
  const directives = cspMetaMatch[1]
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean);
  const scriptDirectiveIndex = directives.findIndex((directive) =>
    directive.toLowerCase().startsWith('script-src')
  );

  if (scriptDirectiveIndex === -1) {
    directives.push(`script-src ${hashToken}`);
  } else {
    const directiveTokens = directives[scriptDirectiveIndex].split(/\s+/).filter(Boolean);
    if (!directiveTokens.includes(hashToken)) directiveTokens.push(hashToken);
    directives[scriptDirectiveIndex] = directiveTokens.join(' ');
  }

  const updatedCsp = `${directives.join('; ')};`;
  return htmlString.replace(
    cspMetaPattern,
    (metaTag) => metaTag.replace(/content="[^"]*"/i, `content="${updatedCsp}"`)
  );
};

const [css, js] = await Promise.all([
  readFile(cssPath, 'utf8'),
  readFile(jsPath, 'utf8')
]);

const assetsDir = resolve(distDir, 'assets');
const assetFiles = await readdir(assetsDir);
const workerFiles = assetFiles.filter((file) => file.includes('.worker') && file.endsWith('.js'));

let inlinedJs = js;
const workerBlobEntries = [];
for (const file of workerFiles) {
  const workerSource = await readFile(resolve(assetsDir, file), 'utf8');
  workerBlobEntries.push(
    `  "${file}": URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], { type: "text/javascript" }))`
  );
  inlinedJs = inlinedJs
    .replaceAll(`new URL("${file}",import.meta.url).href`, `__WORKER_BLOB_URLS["${file}"]`)
    .replaceAll(`new URL("./assets/${file}",import.meta.url).href`, `__WORKER_BLOB_URLS["${file}"]`)
    .replaceAll(`new URL("${file}",import.meta.url)`, `__WORKER_BLOB_URLS["${file}"]`)
    .replaceAll(`new URL("./assets/${file}",import.meta.url)`, `__WORKER_BLOB_URLS["${file}"]`);
}

if (workerBlobEntries.length) {
  inlinedJs = `const __WORKER_BLOB_URLS = Object.freeze({\n${workerBlobEntries.join(',\n')}\n});\n${inlinedJs}`;
}

const htmlWithCspHash = withInlineScriptHashInCsp(html, inlinedJs);

const inlined = htmlWithCspHash
  .replace(cssMatch[0], `<style>${css}</style>`)
  .replace(jsMatch[0], `<script type="module">${inlinedJs}</script>`);

await writeFile(indexPath, inlined, 'utf8');

const distEntries = await readdir(distDir, { withFileTypes: true });
await Promise.all(
  distEntries
    .filter((entry) => entry.name !== 'index.html')
    .map((entry) => rm(resolve(distDir, entry.name), { recursive: true, force: true }))
);

console.log(`Inlined build into standalone ${indexPath}`);
