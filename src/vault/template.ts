import runtimePasswordBundle from './runtime.password.bundle.js?raw';
import runtimeShamirBundle from './runtime.shamir.bundle.js?raw';
import type { Vault } from '../shared/types';

const STYLE = `
  :root {
    color-scheme: dark;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'SF Mono', 'Cascadia Code', 'Consolas', ui-monospace, monospace;

    --text-xs: 0.75rem;
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-md: 1.125rem;
    --text-lg: 1.25rem;

    --leading-tight: 1.2;
    --leading-snug: 1.35;
    --leading-normal: 1.55;

    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-6: 1.5rem;
    --space-8: 2rem;

    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 6px;
    --radius-pill: 999px;

    --color-bg: #101010;
    --color-surface: #171717;
    --color-surface-soft: #212121;
    --color-surface-strong: #141414;
    --color-text: #ededed;
    --color-text-muted: #737373;
    --color-primary: #ededed;
    --color-primary-soft: rgba(237, 237, 237, 0.1);
    --color-accent: #ededed;
    --color-ok: #22c55e;
    --color-error: #ef4444;
    --color-warning: #f59e0b;
    --color-border: #252525;
    --color-border-subtle: #1e1e1e;

    --shadow-deep: none;
    --shadow-glow: none;
    --ease-snappy: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-smooth: cubic-bezier(0.33, 1, 0.68, 1);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--color-text);
    background: var(--color-bg);
    line-height: var(--leading-normal);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #app {
    min-height: 100vh;
    padding: clamp(1rem, 2.4vw, 2rem);
  }

  .vault {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: var(--space-6);
  }

  .vault > header {
    padding: var(--space-4) var(--space-6);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    animation: vaultReveal 560ms var(--ease-smooth) both;
  }

  .vault > header h1 {
    margin: 0;
    font-size: var(--text-lg);
    line-height: var(--leading-tight);
    font-weight: 600;
  }

  .vault > header p {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    max-width: 60ch;
  }

  .vault-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    animation: vaultReveal 520ms var(--ease-smooth) both;
  }

  .vault-card h2 {
    margin: 0 0 var(--space-3);
    font-size: clamp(1.15rem, 1.7vw, 1.6rem);
    line-height: var(--leading-tight);
  }

  .hint {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .status {
    margin-bottom: var(--space-4);
    padding: 0.78rem 0.92rem;
    border-radius: var(--radius-md);
    background: var(--color-surface-soft);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .status[data-tone='error'] {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--color-error);
    color: #fca5a5;
  }

  label {
    display: block;
    margin-top: var(--space-4);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  input,
  textarea,
  select {
    width: 100%;
    margin-top: var(--space-2);
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface-soft);
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--text-sm);
    transition: border-color 160ms var(--ease-snappy);
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: #555;
    background: var(--color-surface-soft);
  }

  textarea {
    min-height: 90px;
    resize: vertical;
  }

  button {
    margin-top: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 0.5rem 0.875rem;
    cursor: pointer;
    transition: all 150ms var(--ease-snappy);
  }

  button:hover:not(:disabled) {
    color: var(--color-text);
    border-color: #3a3a3a;
    background: var(--color-surface-soft);
  }

  button:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  .decrypt > button[data-decrypt-btn] {
    background: var(--color-text);
    border-color: transparent;
    color: var(--color-bg);
  }

  .decrypt > button[data-decrypt-btn]:hover:not(:disabled) {
    background: #ffffff;
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
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-strong);
    padding: 0.78rem 0.9rem;
  }

  .share label {
    margin-top: 0;
  }

  .share textarea {
    min-height: 82px;
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
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-strong);
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
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-surface-strong);
  }

  .progress .bar {
    width: 0;
    height: 100%;
    background: var(--color-text);
    transition: width 220ms var(--ease-snappy);
  }

  .progress--indeterminate .bar {
    width: 40%;
    transition: none;
    animation: vaultProgressIndeterminate 1.2s linear infinite;
  }

  .progress__text {
    margin-top: var(--space-2);
    margin-bottom: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .vault-seed {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
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
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface-strong);
    color: var(--color-text);
    transition: filter 240ms var(--ease-snappy), opacity 240ms var(--ease-snappy);
  }

  .secret[data-hidden='true'] {
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
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface-strong);
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
    color: var(--color-text);
  }

  .path__value {
    margin: 0;
    width: fit-content;
    max-width: 100%;
    padding: 0.38rem 0.56rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: 0.98rem;
    line-height: 1.3;
    word-break: break-all;
  }

  .meta {
    display: grid;
    gap: 0.52rem;
    justify-items: stretch;
    align-content: stretch;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    min-width: 0;
  }

  .passphrase {
    width: 100%;
    display: grid;
    gap: 0.45rem;
    padding: 0.52rem 0.58rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
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
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .passphrase__label-value {
    margin: 0;
    max-width: 100%;
    padding: 0.22rem 0.5rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    background: var(--color-surface-soft);
    color: var(--color-text);
    font-size: var(--text-xs);
    line-height: 1.2;
    word-break: break-word;
  }

  .passphrase__topline button {
    margin-top: 0;
    margin-left: auto;
    padding: 0.24rem 0.62rem;
    font-size: var(--text-xs);
  }

  .passphrase .secret--compact {
    margin-top: 0;
    padding: 0.44rem 0.56rem;
  }

  .path__count {
    margin-top: auto;
    justify-self: end;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .path__none {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .derived-table-wrap {
    margin-top: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
    background: var(--color-surface);
  }

  .derived-table {
    width: 100%;
    min-width: 56rem;
    border-collapse: collapse;
  }

  .derived-table th,
  .derived-table td {
    padding: 0.62rem 0.76rem;
    border-bottom: 1px solid var(--color-border-subtle);
    border-right: 1px solid var(--color-border-subtle);
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
    color: var(--color-text-muted);
    background: var(--color-surface-soft);
  }

  .derived-table tbody tr:nth-child(even) {
    background: var(--color-surface-strong);
  }

  .derived-table tbody tr:last-child td {
    border-bottom: none;
  }

  .derived-table__seed {
    font-weight: 650;
    color: var(--color-text);
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
    font-size: var(--text-sm);
    color: var(--color-text);
    word-break: break-all;
  }

  .vault-files__empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .vault-files__table-wrap {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
    background: var(--color-surface);
  }

  .vault-files__table {
    width: 100%;
    min-width: 50rem;
    border-collapse: collapse;
  }

  .vault-files__table th,
  .vault-files__table td {
    padding: 0.62rem 0.76rem;
    border-bottom: 1px solid var(--color-border-subtle);
    border-right: 1px solid var(--color-border-subtle);
    text-align: left;
    vertical-align: top;
  }

  .vault-files__table th:last-child,
  .vault-files__table td:last-child {
    border-right: none;
  }

  .vault-files__table thead th {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
    background: var(--color-surface-soft);
  }

  .vault-files__table tbody tr:nth-child(even) {
    background: var(--color-surface-strong);
  }

  .vault-files__table tbody tr:last-child td {
    border-bottom: none;
  }

  .vault-files__label {
    font-weight: 650;
    color: var(--color-text);
    min-width: 9rem;
  }

  .vault-files__hint {
    min-width: 14rem;
    color: var(--color-text-muted);
  }

  .vault-files__table button {
    margin-top: 0;
    padding: 0.32rem 0.64rem;
    font-size: var(--text-xs);
  }

  .mono,
  .path__value,
  .secret,
  .share textarea,
  .derived-table__path,
  .derived-table code {
    font-family: var(--font-mono);
  }

  @keyframes vaultProgressIndeterminate {
    0% { transform: translateX(-130%); }
    100% { transform: translateX(330%); }
  }

  @keyframes vaultReveal {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 900px) {
    .vault {
      gap: var(--space-4);
    }

    .vault > header,
    .vault-card {
      padding: var(--space-4);
    }

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

    .vault-files__table {
      min-width: 44rem;
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; worker-src blob:; child-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';" />
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
