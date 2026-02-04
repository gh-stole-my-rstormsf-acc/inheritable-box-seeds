import { decryptWithPassword, decryptWithShamir } from '../shared/crypto/vault';
import { deriveEvmAddresses } from '../shared/derivation/evm';
import { buildAddressCsv } from '../shared/derivation/csv';
import { shareFromHex, shareFromMnemonic } from '../shared/crypto/shamir';
import type { Vault, VaultData, PathConfig } from '../shared/types';
import { deriveKeyArgon2Wasm } from './argon2Wasm';

const vault = (window as unknown as { __SEED_VAULT__: Vault }).__SEED_VAULT__;

if (!vault) {
  throw new Error('Vault data missing.');
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app');
}

const state: {
  decrypted?: VaultData;
  derivedRows?: Array<{ seedLabel: string; path: string; passphrase: string; index: number; address: string }>;
} = {};

const setStatus = (message: string, tone: 'info' | 'error' = 'info') => {
  const status = document.querySelector<HTMLDivElement>('[data-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
};

const renderSeedList = (data: VaultData) => {
  const container = document.querySelector<HTMLDivElement>('[data-seeds]');
  if (!container) return;

  container.innerHTML = '';
  data.seeds.forEach((seed, seedIndex) => {
    const seedEl = document.createElement('section');
    seedEl.className = 'vault-seed';
    const mnemonicId = `seed-${seedIndex}-mnemonic`;

    seedEl.innerHTML = `
      <header>
        <h3>${seed.label}</h3>
        <button data-reveal="${mnemonicId}">Reveal</button>
      </header>
      <p class="secret" id="${mnemonicId}" data-hidden="true">${seed.mnemonic}</p>
      <div class="paths"></div>
    `;

    const pathsContainer = seedEl.querySelector<HTMLDivElement>('.paths');
    seed.paths.forEach((pathConfig: PathConfig, pathIndex) => {
      const pathEl = document.createElement('div');
      pathEl.className = 'path';
      const passphraseHint = pathConfig.passphrase ? '[passphrase set]' : '[none]';
      pathEl.innerHTML = `
        <div>
          <strong>${pathConfig.label}</strong>
          <p>${pathConfig.path}</p>
        </div>
        <div class="meta">
          <span>Passphrase: ${passphraseHint}</span>
          <span>Addresses: ${pathConfig.deriveCount}</span>
        </div>
      `;
      pathsContainer?.appendChild(pathEl);
    });

    container.appendChild(seedEl);
  });

  container.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((button) => {
    let timeoutId: number | undefined;
    button.addEventListener('click', () => {
      const targetId = button.dataset.reveal;
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      const hidden = target.dataset.hidden === 'true';
      target.dataset.hidden = hidden ? 'false' : 'true';
      button.textContent = hidden ? 'Hide' : 'Reveal';
      if (hidden) {
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          target.dataset.hidden = 'true';
          button.textContent = 'Reveal';
        }, 30000);
      }
    });
  });
};

const renderDerivedAddresses = () => {
  const container = document.querySelector<HTMLDivElement>('[data-derived]');
  if (!container) return;
  container.innerHTML = '';
  const rows = state.derivedRows ?? [];
  if (!rows.length) {
    container.innerHTML = '<p>No derived addresses yet.</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'derived-list';
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'derived-item';
    item.innerHTML = `
      <div>
        <strong>${row.seedLabel}</strong>
        <p>${row.path} (index ${row.index})</p>
      </div>
      <code>${row.address}</code>
    `;
    list.appendChild(item);
  });
  container.appendChild(list);
};

const handleDeriveAddresses = () => {
  if (!state.decrypted) return;
  const rows: Array<{ seedLabel: string; path: string; passphrase: string; index: number; address: string }> = [];
  state.decrypted.seeds.forEach((seed) => {
    seed.paths.forEach((pathConfig) => {
      const derived = deriveEvmAddresses(
        seed.mnemonic,
        pathConfig.passphrase,
        pathConfig.path,
        pathConfig.deriveCount
      );
      derived.forEach((address) => {
        rows.push({
          seedLabel: seed.label,
          path: address.path,
          passphrase: pathConfig.passphrase,
          index: address.index,
          address: address.address
        });
      });
    });
  });
  state.derivedRows = rows;
  renderDerivedAddresses();
};

const handleExportCsv = () => {
  if (!state.derivedRows || state.derivedRows.length === 0) {
    setStatus('Derive addresses before exporting CSV.', 'error');
    return;
  }
  const csv = buildAddressCsv(state.derivedRows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'seed-vault-addresses.csv';
  anchor.click();
  URL.revokeObjectURL(url);
};

const renderApp = () => {
  root.innerHTML = `
    <main class="vault">
      <header>
        <h1>Seed Vault</h1>
        <p>Offline vault. Decrypt with your password or shares.</p>
      </header>
      <section class="vault-card">
        <h2>Decrypt Vault</h2>
        <p class="hint">${vault.hint ? `Hint: ${vault.hint}` : 'No hint stored.'}</p>
        <div data-status class="status" data-tone="info"></div>
        <div class="decrypt" data-decrypt></div>
      </section>
      <section class="vault-card">
        <h2>Seeds</h2>
        <div data-seeds></div>
      </section>
      <section class="vault-card">
        <h2>Derived Addresses</h2>
        <div class="actions">
          <button data-derive>Derive Addresses</button>
          <button data-export>Export CSV</button>
        </div>
        <div data-derived></div>
      </section>
    </main>
  `;

  const decryptContainer = root.querySelector<HTMLDivElement>('[data-decrypt]');
  if (!decryptContainer) return;

  if (vault.encryption.type === 'password') {
    decryptContainer.innerHTML = `
      <label>Password</label>
      <input type="password" data-password placeholder="Enter password" />
      <button data-decrypt-btn>Decrypt</button>
      <div class="progress" hidden data-progress>
        <div class="bar" data-progress-bar></div>
      </div>
    `;

    const decryptButton = decryptContainer.querySelector<HTMLButtonElement>('[data-decrypt-btn]');
    const passwordInput = decryptContainer.querySelector<HTMLInputElement>('[data-password]');
    const progress = decryptContainer.querySelector<HTMLDivElement>('[data-progress]');
    const progressBar = decryptContainer.querySelector<HTMLDivElement>('[data-progress-bar]');

    decryptButton?.addEventListener('click', async () => {
      if (!passwordInput?.value) {
        setStatus('Enter your password.', 'error');
        return;
      }
      setStatus('Decrypting...', 'info');
      if (progress && progressBar) {
        progress.hidden = false;
        progressBar.style.width = '0%';
      }
      try {
        const data = await decryptWithPassword({
          password: passwordInput.value,
          vault,
          kdf: deriveKeyArgon2Wasm,
          onProgress: (value) => {
            if (progressBar) {
              progressBar.style.width = `${Math.round(value * 100)}%`;
            }
          }
        });
        state.decrypted = data;
        setStatus('Vault decrypted.', 'info');
        renderSeedList(data);
        passwordInput.value = '';
      } catch (error) {
        setStatus((error as Error).message, 'error');
      } finally {
        if (progress) progress.hidden = true;
      }
    });
  } else {
    const threshold = vault.encryption.threshold;
    const total = vault.encryption.totalShares;
    const inputs = Array.from({ length: threshold }, (_, index) => `
      <div class="share">
        <label>Share ${index + 1}</label>
        <input type="number" min="1" max="${total}" data-share-id placeholder="ID" />
        <textarea data-share-value placeholder="Paste share"></textarea>
      </div>
    `).join('');

    decryptContainer.innerHTML = `
      <div class="toggle">
        <label>
          <input type="radio" name="shareFormat" value="mnemonic" checked /> Words
        </label>
        <label>
          <input type="radio" name="shareFormat" value="hex" /> Hex
        </label>
      </div>
      ${inputs}
      <button data-decrypt-btn>Decrypt</button>
    `;

    const decryptButton = decryptContainer.querySelector<HTMLButtonElement>('[data-decrypt-btn]');

    decryptButton?.addEventListener('click', () => {
      const format = (decryptContainer.querySelector<HTMLInputElement>('input[name="shareFormat"]:checked')?.value ?? 'mnemonic') as
        | 'mnemonic'
        | 'hex';
      const shareIdInputs = Array.from(decryptContainer.querySelectorAll<HTMLInputElement>('[data-share-id]'));
      const shareValueInputs = Array.from(decryptContainer.querySelectorAll<HTMLTextAreaElement>('[data-share-value]'));
      const shares = shareIdInputs.map((input, idx) => {
        const id = Number(input.value);
        const value = shareValueInputs[idx]?.value?.trim() ?? '';
        if (!id || !value) {
          throw new Error('Provide all required shares.');
        }
        return format === 'hex' ? shareFromHex(id, value) : shareFromMnemonic(id, value);
      });

      try {
        const data = decryptWithShamir({ shares, vault });
        state.decrypted = data;
        setStatus('Vault decrypted.', 'info');
        renderSeedList(data);
        shareIdInputs.forEach((input) => (input.value = ''));
        shareValueInputs.forEach((input) => (input.value = ''));
      } catch (error) {
        setStatus((error as Error).message, 'error');
      }
    });
  }

  root.querySelector<HTMLButtonElement>('[data-derive]')?.addEventListener('click', handleDeriveAddresses);
  root.querySelector<HTMLButtonElement>('[data-export]')?.addEventListener('click', handleExportCsv);
  renderDerivedAddresses();
};

window.addEventListener('beforeunload', () => {
  state.decrypted = undefined;
  state.derivedRows = undefined;
  const seeds = document.querySelector('[data-seeds]');
  if (seeds) seeds.innerHTML = '';
});

renderApp();
