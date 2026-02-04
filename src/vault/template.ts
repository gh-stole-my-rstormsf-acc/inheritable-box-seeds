import runtimeBundle from './runtime.bundle.js?raw';
import type { Vault } from '../shared/types';

const STYLE = `
  :root {
    color-scheme: light;
    font-family: "Iowan Old Style", "Palatino Linotype", "Palatino", serif;
    background: #f8f4ec;
    color: #1f1f1f;
  }
  body { margin: 0; background: linear-gradient(180deg, #faf6ef, #efe6d8); }
  .vault { max-width: 860px; margin: 0 auto; padding: 32px 20px 60px; }
  .vault h1 { margin-bottom: 6px; }
  .vault-card { background: #fff; border-radius: 16px; padding: 20px; margin: 20px 0; box-shadow: 0 12px 30px rgba(0,0,0,0.08); }
  .vault-card h2 { margin-top: 0; }
  .status { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: #f0efe9; }
  .status[data-tone="error"] { background: #ffe6e6; color: #7b1a1a; }
  .hint { color: #444; }
  .decrypt label { display: block; margin: 12px 0 6px; }
  .decrypt input, .decrypt textarea { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #d8d2c6; font-family: inherit; }
  .decrypt button { margin-top: 12px; padding: 10px 16px; border-radius: 10px; border: none; background: #2f5d62; color: #fff; cursor: pointer; }
  .vault-seed { border-top: 1px solid #eee; padding: 16px 0; }
  .vault-seed:first-child { border-top: none; }
  .vault-seed header { display: flex; justify-content: space-between; align-items: center; }
  .vault-seed button { padding: 6px 12px; border-radius: 8px; border: 1px solid #d8d2c6; background: #f7f3ec; cursor: pointer; }
  .secret { font-family: "Courier New", monospace; background: #f7f3ec; padding: 12px; border-radius: 10px; transition: filter 0.3s ease, opacity 0.3s ease; }
  .secret[data-hidden="true"] { filter: blur(6px); opacity: 0.35; user-select: none; }
  .path { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px dashed #eee; }
  .path:last-child { border-bottom: none; }
  .meta { display: flex; flex-direction: column; gap: 4px; color: #555; font-size: 0.9rem; }
  .actions { display: flex; gap: 12px; margin-bottom: 12px; }
  .actions button { padding: 10px 14px; border-radius: 10px; border: 1px solid #d8d2c6; background: #f7f3ec; cursor: pointer; }
  .derived-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
  .derived-item:last-child { border-bottom: none; }
  .derived-item code { font-family: "Courier New", monospace; }
  .toggle { display: flex; gap: 12px; margin-bottom: 12px; }
  .progress { background: #ece4d7; border-radius: 8px; height: 10px; overflow: hidden; }
  .progress .bar { background: #2f5d62; height: 100%; width: 0; transition: width 0.2s ease; }
  @media (max-width: 600px) {
    .path { flex-direction: column; }
    .actions { flex-direction: column; }
  }
`;

export const buildVaultHtml = (vault: Vault) => {
  const vaultJson = JSON.stringify(vault);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; img-src data:; connect-src 'none';" />
    <title>Seed Vault</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <div id="app"></div>
    <script>window.__SEED_VAULT__ = ${vaultJson};</script>
    <script>${runtimeBundle}</script>
  </body>
</html>`;
};
