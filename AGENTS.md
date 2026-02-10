# Repository Guardrails

These rules are **non‑negotiable** for changes in this repo.

## Deployment URL Invariants

The app **must work** when served from:

`https://gh-stole-my-rstormsf-acc.github.io/inheritable-box-seeds/`

To avoid breaking this URL:

- **Do not introduce absolute `/` asset URLs** in production output.
- Any changes to `vite.config.ts`, `index.html`, or build scripts **must preserve**
  asset paths that resolve under `/inheritable-box-seeds/`.
- If you change the Vite `base` value, verify that assets load correctly
  from the GitHub Pages path above.

## Build/Test Discipline

- Local branch work (non-`main`): after any file change, run:
  - `npm run test:unit`
  - `npm run test:e2e:chromium`
- Before pushing to `main`, run full cross-browser checks:
  - `npm run test:unit`
  - `npm run test:e2e`
- If you touch build config or asset paths, also run:
  - `npm run build`
