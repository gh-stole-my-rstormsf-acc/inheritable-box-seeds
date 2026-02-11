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

## Session Lessons Learned (Wizard + Vault UX)

- Avoid full `render()` calls for hot-path field edits (`threshold`, `total`, inline validation updates). Prefer targeted DOM/state sync helpers to prevent screen flashing.
- In Shamir mode, Security -> Finalize must be gated: disable `Next: Finalize` until shares are generated/reviewed for the current state fingerprint.
- Finalize must reuse prepared Shamir output from Step 3. Do not regenerate fresh shares at finalize click.
- Keep path management per-seed: each seed has its own `Add Path`; do not reintroduce a global add-path seed/preset chooser flow.
- If a seed has only one path, keep `Remove` disabled and show an immediate tooltip explaining why.
- Validation timing: do not show red field errors immediately when entering a step. Arm on navigation attempt; once armed, clear errors immediately when inputs are fixed.
- In the vault page, render derived addresses as a compact table. Do not use per-address card wrappers or extra `Index N` wording.
- When `src/vault/runtime.ts` changes, regenerate and commit `src/vault/runtime.bundle.js` to keep runtime/template behavior in sync.
- Vault UI changes should match creator style language (tokens, spacing, hierarchy). Use the frontend skill guidance for visual polish work.
- Maintain e2e coverage for Shamir prepare/gating behavior, non-flashing `k/n` edits, disabled single-path remove tooltip, and derived-table rendering.
