import runtimePasswordBundle from './runtime.password.bundle.js?raw';
import runtimeShamirBundle from './runtime.shamir.bundle.js?raw';
import type { Vault } from '../shared/types';

const STYLE = `
  :root {
    color-scheme: dark;
    font-family: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
    --text-xs: 0.75rem;
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-lg: 1.5rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-6: 1.5rem;
    --space-8: 2rem;
    --radius-sm: 0.7rem;
    --radius-md: 1rem;
    --radius-lg: 1.35rem;
    --radius-pill: 999px;
    --color-bg: #0a152a;
    --color-surface: #12233f;
    --color-surface-strong: #0d1e37;
    --color-text: #e5eef9;
    --color-text-muted: #9cb2cf;
    --color-primary: #2ee4ea;
    --color-border: rgba(107, 153, 215, 0.36);
    --color-border-subtle: rgba(122, 164, 219, 0.2);
    --color-ok: #45dc93;
    --color-error: #ff8e7f;
    --shadow-deep: 0 24px 60px rgba(2, 9, 24, 0.48), 0 8px 24px rgba(0, 0, 0, 0.28);
    --shadow-glow: 0 0 0 1px rgba(46, 228, 234, 0.3), 0 0 24px rgba(46, 228, 234, 0.22);
    --ease-snappy: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-smooth: cubic-bezier(0.33, 1, 0.68, 1);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--color-text);
    background:
      radial-gradient(circle at 14% 0%, rgba(46, 228, 234, 0.2), transparent 32%),
      radial-gradient(circle at 87% 20%, rgba(87, 142, 255, 0.22), transparent 34%),
      linear-gradient(145deg, #091325 0%, #0c1a2f 50%, #0a162b 100%);
    line-height: 1.55;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.3;
    background:
      repeating-linear-gradient(90deg, rgba(57, 101, 157, 0.08), rgba(57, 101, 157, 0.08) 1px, transparent 1px, transparent 180px),
      repeating-linear-gradient(0deg, rgba(57, 101, 157, 0.06), rgba(57, 101, 157, 0.06) 1px, transparent 1px, transparent 120px);
  }
  #app {
    min-height: 100vh;
    padding: clamp(1rem, 2.4vw, 2rem);
    position: relative;
    z-index: 1;
  }
  .vault {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: var(--space-6);
  }
  .vault > header {
    padding: var(--space-6) var(--space-8);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    background: linear-gradient(135deg, rgba(14, 30, 55, 0.92), rgba(10, 22, 44, 0.88));
    box-shadow: var(--shadow-deep);
    animation: vaultReveal 560ms var(--ease-smooth) both;
  }
  .vault > header h1 {
    margin: 0;
    font-size: clamp(1.6rem, 2vw, 2.3rem);
    line-height: 1.15;
  }
  .vault > header p {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    max-width: 60ch;
  }
  .vault-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(17, 35, 63, 0.96), rgba(10, 24, 48, 0.93));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-deep);
    padding: var(--space-6);
    animation: vaultReveal 520ms var(--ease-smooth) both;
  }
  .vault-card::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle at 100% 0%, rgba(46, 228, 234, 0.12), transparent 38%);
  }
  .vault-card h2 {
    margin: 0 0 var(--space-3);
    font-size: clamp(1.2rem, 1.7vw, 1.7rem);
    line-height: 1.15;
  }
  .hint {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .status {
    margin-bottom: var(--space-4);
    padding: 0.72rem 0.9rem;
    border-radius: var(--radius-sm);
    background: rgba(14, 34, 58, 0.88);
    border: 1px solid rgba(121, 168, 227, 0.35);
    color: #c9ddf5;
  }
  .status[data-tone="error"] {
    background: rgba(87, 35, 38, 0.8);
    border-color: rgba(255, 143, 125, 0.54);
    color: #ffd4cc;
  }
  label {
    display: block;
    margin-top: var(--space-4);
    font-size: var(--text-sm);
    font-weight: 650;
    color: #c7daf3;
  }
  input, textarea, select {
    width: 100%;
    margin-top: var(--space-2);
    padding: 0.7rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(136, 180, 236, 0.36);
    background: rgba(8, 20, 40, 0.6);
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--text-base);
    transition: border-color 160ms var(--ease-snappy), box-shadow 160ms var(--ease-snappy), background 160ms var(--ease-snappy);
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: rgba(46, 228, 234, 0.85);
    box-shadow: 0 0 0 3px rgba(46, 228, 234, 0.16);
    background: rgba(10, 26, 53, 0.74);
  }
  textarea {
    min-height: 90px;
    resize: vertical;
  }
  button {
    margin-top: var(--space-3);
    border-radius: 0.85rem;
    border: 1px solid rgba(127, 171, 230, 0.38);
    background: rgba(22, 45, 76, 0.75);
    color: #c7daf3;
    font-size: var(--text-sm);
    font-weight: 650;
    padding: 0.62rem 0.95rem;
    cursor: pointer;
    transition: transform 150ms var(--ease-snappy), border-color 150ms var(--ease-snappy), background 150ms var(--ease-snappy), box-shadow 150ms var(--ease-snappy);
  }
  button:hover {
    transform: translateY(-1px);
    border-color: rgba(46, 228, 234, 0.65);
    background: rgba(28, 57, 95, 0.85);
    box-shadow: var(--shadow-glow);
  }
  button:disabled {
    opacity: 0.58;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
  .decrypt > button[data-decrypt-btn] {
    background: linear-gradient(135deg, rgba(32, 96, 139, 0.95), rgba(21, 70, 123, 0.95));
    border-color: rgba(81, 171, 255, 0.62);
    color: #ecf8ff;
  }
  .decrypt {
    display: grid;
    gap: var(--space-3);
  }
  .decrypt > label {
    margin-top: var(--space-2);
  }
  .decrypt > button {
    justify-self: start;
  }
  .share {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: linear-gradient(145deg, rgba(10, 24, 45, 0.75), rgba(8, 20, 38, 0.72));
    padding: 0.78rem 0.9rem;
  }
  .share label {
    margin-top: 0;
  }
  .share textarea {
    min-height: 82px;
    border-color: rgba(101, 151, 216, 0.4);
    background: rgba(5, 14, 29, 0.6);
  }
  .share + .share {
    margin-top: var(--space-2);
  }
  .actions {
    margin-top: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }
  .actions button {
    margin-top: 0;
  }
  .toggle {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: var(--space-3) 0 var(--space-2);
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(9, 22, 42, 0.45);
  }
  .toggle label {
    margin-top: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .toggle input {
    margin-top: 0;
    width: auto;
  }
  .progress {
    height: 0.62rem;
    margin-top: var(--space-3);
    border-radius: 0.55rem;
    overflow: hidden;
    border: 1px solid rgba(93, 139, 194, 0.33);
    background: rgba(10, 24, 47, 0.92);
  }
  .progress .bar {
    width: 0;
    height: 100%;
    background: linear-gradient(135deg, #2ee4ea, #57cbff);
    transition: width 220ms var(--ease-snappy);
  }
  .vault-seed {
    padding: var(--space-4);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: linear-gradient(140deg, rgba(24, 44, 74, 0.8), rgba(13, 28, 53, 0.75));
  }
  .vault-seed + .vault-seed {
    margin-top: var(--space-4);
  }
  .vault-seed header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .vault-seed h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .secret {
    margin-top: var(--space-3);
    padding: 0.72rem 0.88rem;
    border-radius: 0.72rem;
    border: 1px solid rgba(96, 143, 206, 0.35);
    background: rgba(8, 20, 40, 0.62);
    color: #d9ecff;
    font-family: "Courier New", monospace;
    transition: filter 240ms var(--ease-snappy), opacity 240ms var(--ease-snappy);
  }
  .secret[data-hidden="true"] {
    filter: blur(6px);
    opacity: 0.35;
    user-select: none;
  }
  .secret--compact {
    margin-top: 0;
    padding: 0.42rem 0.56rem;
    font-size: 0.82rem;
    line-height: 1.25;
  }
  .paths {
    margin-top: var(--space-4);
    display: grid;
    gap: var(--space-3);
  }
  .path {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 1fr);
    gap: var(--space-4);
    padding: 1rem 1.05rem;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(114, 166, 230, 0.36);
    background:
      radial-gradient(circle at 100% 0%, rgba(39, 119, 214, 0.14), transparent 48%),
      linear-gradient(145deg, rgba(8, 22, 44, 0.78), rgba(8, 19, 38, 0.7));
    box-shadow: inset 0 0 0 1px rgba(71, 123, 191, 0.18);
  }
  .path__info {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 0.62rem;
  }
  .path__title {
    margin: 0;
    font-size: clamp(1rem, 1vw, 1.18rem);
    line-height: 1.2;
    color: #deecff;
  }
  .path__value {
    margin: 0;
    width: fit-content;
    max-width: 100%;
    padding: 0.38rem 0.56rem;
    border-radius: 0.62rem;
    border: 1px solid rgba(117, 168, 231, 0.3);
    background: rgba(6, 19, 38, 0.6);
    color: #aac3e0;
    font-size: 0.98rem;
    font-family: "IBM Plex Mono", "JetBrains Mono", "Fira Code", monospace;
    line-height: 1.3;
    word-break: break-all;
  }
  .meta {
    display: grid;
    gap: 0.52rem;
    justify-items: stretch;
    align-content: stretch;
    color: #aac2df;
    font-size: var(--text-sm);
    min-width: 0;
  }
  .passphrase {
    width: 100%;
    display: grid;
    gap: 0.45rem;
    padding: 0.52rem 0.58rem;
    border-radius: 0.72rem;
    border: 1px solid rgba(113, 171, 238, 0.44);
    background:
      radial-gradient(circle at 100% 50%, rgba(25, 90, 168, 0.22), transparent 52%),
      linear-gradient(148deg, rgba(7, 20, 42, 0.8), rgba(5, 15, 31, 0.74));
  }
  .passphrase__topline {
    display: flex;
    align-items: center;
    gap: 0.46rem;
    flex-wrap: wrap;
    min-width: 0;
  }
  .passphrase__label-key {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #84abda;
    white-space: nowrap;
  }
  .passphrase__label-value {
    margin: 0;
    max-width: 100%;
    padding: 0.22rem 0.5rem;
    border-radius: var(--radius-pill);
    border: 1px solid rgba(125, 180, 243, 0.4);
    background: rgba(17, 48, 84, 0.5);
    color: #e4f1ff;
    font-size: var(--text-xs);
    line-height: 1.2;
    word-break: break-word;
  }
  .passphrase__topline button {
    margin-top: 0;
    margin-left: auto;
    padding: 0.24rem 0.62rem;
    font-size: var(--text-xs);
    border-color: rgba(125, 184, 249, 0.58);
    background: rgba(26, 65, 108, 0.82);
    color: #e6f4ff;
  }
  .passphrase .secret--compact {
    margin-top: 0;
    padding: 0.44rem 0.56rem;
    border-color: rgba(118, 171, 236, 0.34);
    background: rgba(6, 18, 35, 0.72);
    color: #d5e8ff;
  }
  .path__count {
    margin-top: auto;
    justify-self: end;
    color: #b7cff0;
    font-size: var(--text-sm);
  }
  .path__none {
    color: #8ea9cb;
    font-size: var(--text-sm);
  }
  .derived-table-wrap {
    margin-top: var(--space-2);
    border: 1px solid rgba(101, 149, 210, 0.34);
    border-radius: 0.72rem;
    overflow-x: auto;
    background: rgba(9, 22, 42, 0.55);
  }
  .derived-table {
    width: 100%;
    min-width: 56rem;
    border-collapse: collapse;
  }
  .derived-table th,
  .derived-table td {
    padding: 0.62rem 0.76rem;
    border-bottom: 1px solid rgba(101, 149, 210, 0.24);
    border-right: 1px solid rgba(101, 149, 210, 0.18);
    text-align: left;
    vertical-align: top;
  }
  .derived-table th:last-child,
  .derived-table td:last-child {
    border-right: none;
  }
  .derived-table thead th {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #aec8e8;
    background: rgba(11, 27, 50, 0.72);
  }
  .derived-table tbody tr:nth-child(even) {
    background: rgba(7, 18, 35, 0.36);
  }
  .derived-table tbody tr:last-child td {
    border-bottom: none;
  }
  .derived-table__seed {
    font-weight: 650;
    color: #cfe1f8;
    white-space: nowrap;
  }
  .derived-table__path {
    min-width: 12.5rem;
    color: var(--color-text-muted);
    word-break: break-all;
  }
  .derived-table__passphrase-label {
    min-width: 7rem;
    color: var(--color-text-muted);
    word-break: break-word;
  }
  .derived-table__passphrase {
    min-width: 12.5rem;
  }
  .derived-table__passphrase-cell {
    display: grid;
    gap: 0.42rem;
  }
  .derived-table__passphrase-cell button {
    margin-top: 0;
    justify-self: start;
    padding: 0.32rem 0.64rem;
    font-size: var(--text-xs);
  }
  .derived-table__passphrase-cell .secret {
    margin-top: 0;
  }
  .derived-table__none {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .derived-table__address {
    min-width: 19rem;
  }
  .derived-table code {
    font-family: "Courier New", monospace;
    font-size: var(--text-sm);
    color: #dff1ff;
    word-break: break-all;
  }
  @keyframes vaultReveal {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 900px) {
    .vault { gap: var(--space-4); }
    .vault > header, .vault-card { padding: var(--space-4); }
    .path {
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }
    .meta {
      justify-items: stretch;
    }
    .path__value {
      width: 100%;
    }
    .path__count {
      justify-self: start;
    }
    .derived-table {
      min-width: 50rem;
    }
    .derived-table code {
      white-space: normal;
    }
  }
  @media (max-width: 640px) {
    #app {
      padding: 0.75rem;
    }
    .vault-seed header {
      flex-direction: column;
      align-items: flex-start;
    }
    .actions {
      flex-direction: column;
      align-items: stretch;
    }
    .actions button {
      width: 100%;
    }
  }
`;

export const buildVaultHtml = (vault: Vault) => {
  const vaultJson = JSON.stringify(vault).replace(/[<\u2028\u2029]/g, (char) => {
    switch (char) {
      case '<':
        return '\\u003c';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return char;
    }
  });

  const runtimeBundle = vault.encryption.type === 'password' ? runtimePasswordBundle : runtimeShamirBundle;
  const runtimeMode = vault.encryption.type === 'password' ? 'password-only' : 'shamir-only';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';" />
    <meta http-equiv="X-Content-Type-Options" content="nosniff" />
    <meta http-equiv="Referrer-Policy" content="no-referrer" />
    <title>Seed Vault</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <div id="app"></div>
    <!-- VAULT_RUNTIME_MODE: ${runtimeMode} -->
    <script>window.__SEED_VAULT__ = ${vaultJson};</script>
    <script>${runtimeBundle}</script>
  </body>
</html>`;
};
