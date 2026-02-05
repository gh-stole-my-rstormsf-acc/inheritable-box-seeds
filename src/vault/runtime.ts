import { decryptWithPassword, decryptWithShamir } from '../shared/crypto/vault';
import { deriveEvmAddresses } from '../shared/derivation/evm';
import { buildAddressCsv } from '../shared/derivation/csv';
import { parseShareHex, parseShareMnemonic } from '../shared/crypto/shamir';
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
  derivedRows?: Array<{
    seedLabel: string;
    path: string;
    passphrase: string;
    passphraseLabel: string;
    index: number;
    address: string;
  }>;
} = {};

type Child = Node | string | null | undefined;

interface ElementProps {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  value?: string;
  type?: string;
  checked?: boolean;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
  min?: string;
  max?: string;
  readOnly?: boolean;
  hidden?: boolean;
}

const appendChildren = (parent: HTMLElement, children: Child[]) => {
  children.forEach((child) => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') {
      parent.appendChild(document.createTextNode(child));
    } else {
      parent.appendChild(child);
    }
  });
};

const el = <T extends HTMLElement>(
  tag: keyof HTMLElementTagNameMap,
  props: ElementProps = {},
  children: Child[] = []
): T => {
  const node = document.createElement(tag) as T;
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    Object.entries(props.attrs).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });
  }
  if (props.dataset) {
    Object.entries(props.dataset).forEach(([key, value]) => {
      node.dataset[key] = value;
    });
  }
  if (props.value !== undefined && 'value' in node) {
    (node as HTMLInputElement | HTMLTextAreaElement).value = props.value;
  }
  if (props.type !== undefined && node instanceof HTMLInputElement) {
    node.type = props.type;
  }
  if (props.checked !== undefined && node instanceof HTMLInputElement) {
    node.checked = props.checked;
  }
  if (props.disabled !== undefined && 'disabled' in node) {
    (node as HTMLButtonElement | HTMLInputElement).disabled = props.disabled;
  }
  if (props.placeholder !== undefined && 'placeholder' in node) {
    (node as HTMLInputElement | HTMLTextAreaElement).placeholder = props.placeholder;
  }
  if (props.name !== undefined && node instanceof HTMLInputElement) {
    node.name = props.name;
  }
  if (props.id !== undefined) {
    node.id = props.id;
  }
  if (props.min !== undefined && node instanceof HTMLInputElement) {
    node.min = props.min;
  }
  if (props.max !== undefined && node instanceof HTMLInputElement) {
    node.max = props.max;
  }
  if (props.readOnly !== undefined && node instanceof HTMLTextAreaElement) {
    node.readOnly = props.readOnly;
  }
  if (props.hidden !== undefined) {
    node.hidden = props.hidden;
  }
  appendChildren(node, children);
  return node;
};

const setStatus = (message: string, tone: 'info' | 'error' = 'info') => {
  const status = document.querySelector<HTMLDivElement>('[data-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
};

const attachRevealHandlers = (scope: ParentNode) => {
  scope.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((button) => {
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

const renderSeedList = (data: VaultData) => {
  const container = document.querySelector<HTMLDivElement>('[data-seeds]');
  if (!container) return;

  container.replaceChildren();
  data.seeds.forEach((seed, seedIndex) => {
    const seedEl = el('section', { className: 'vault-seed' });
    const mnemonicId = `seed-${seedIndex}-mnemonic`;
    const header = el('header', {}, [
      el('h3', { text: seed.label }),
      el('button', { dataset: { reveal: mnemonicId }, text: 'Reveal' })
    ]);
    seedEl.appendChild(header);
    seedEl.appendChild(
      el('p', {
        className: 'secret',
        id: mnemonicId,
        dataset: { hidden: 'true' },
        text: seed.mnemonic
      })
    );

    const pathsContainer = el('div', { className: 'paths' });
    seed.paths.forEach((pathConfig: PathConfig, pathIndex) => {
      const pathEl = el('div', { className: 'path' });
      const passphraseId = `seed-${seedIndex}-path-${pathIndex}-passphrase`;
      const passphraseLabel = pathConfig.passphraseLabel?.trim();

      const info = el('div', {}, [el('strong', { text: pathConfig.label }), el('p', { text: pathConfig.path })]);
      const meta = el('div', { className: 'meta' });

      if (pathConfig.passphrase) {
        const passphrase = el('div', { className: 'passphrase' });
        const passHeader = el('div', { className: 'passphrase__header' }, [
          el('span', { text: 'Passphrase' }),
          el('button', { dataset: { reveal: passphraseId }, text: 'Reveal' })
        ]);
        passphrase.appendChild(passHeader);
        passphrase.appendChild(el('p', { className: 'passphrase__label', text: passphraseLabel || '[unlabeled]' }));
        passphrase.appendChild(
          el('p', {
            className: 'secret secret--compact',
            id: passphraseId,
            dataset: { hidden: 'true' },
            text: pathConfig.passphrase
          })
        );
        meta.appendChild(passphrase);
      } else {
        meta.appendChild(el('span', { text: 'Passphrase: [none]' }));
      }

      meta.appendChild(el('span', { text: `Addresses: ${pathConfig.deriveCount}` }));
      pathEl.appendChild(info);
      pathEl.appendChild(meta);
      pathsContainer.appendChild(pathEl);
    });

    seedEl.appendChild(pathsContainer);
    container.appendChild(seedEl);
  });

  attachRevealHandlers(container);
};

const renderDerivedAddresses = () => {
  const container = document.querySelector<HTMLDivElement>('[data-derived]');
  if (!container) return;
  container.replaceChildren();
  const rows = state.derivedRows ?? [];
  if (!rows.length) {
    container.appendChild(el('p', { text: 'No derived addresses yet.' }));
    return;
  }

  const groups = new Map<
    string,
    { seedLabel: string; path: string; passphrase: string; passphraseLabel: string; rows: typeof rows }
  >();
  rows.forEach((row) => {
    const key = `${row.seedLabel}::${row.path}::${row.passphrase}::${row.passphraseLabel}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, {
        seedLabel: row.seedLabel,
        path: row.path,
        passphrase: row.passphrase,
        passphraseLabel: row.passphraseLabel,
        rows: [row]
      });
    }
  });

  let groupIndex = 0;
  let rowNumber = 1;
  groups.forEach((group) => {
    const groupEl = el('section', { className: 'derived-group' });
    const passphraseId = `derived-passphrase-${groupIndex}`;
    const passphraseLabel = group.passphraseLabel?.trim();

    const header = el('div', { className: 'derived-group__header' });
    const meta = el('div', { className: 'derived-group__meta' }, [
      el('strong', { text: group.seedLabel }),
      el('span', { text: group.path })
    ]);
    const passphraseMeta = el('div', { className: 'derived-group__passphrase' });

    if (group.passphrase) {
      const passphrase = el('div', { className: 'passphrase' });
      const passHeader = el('div', { className: 'passphrase__header' }, [
        el('span', { text: 'Passphrase' }),
        el('button', { dataset: { reveal: passphraseId }, text: 'Reveal' })
      ]);
      passphrase.appendChild(passHeader);
      passphrase.appendChild(el('p', { className: 'passphrase__label', text: passphraseLabel || '[unlabeled]' }));
      passphrase.appendChild(
        el('p', {
          className: 'secret secret--compact',
          id: passphraseId,
          dataset: { hidden: 'true' },
          text: group.passphrase
        })
      );
      passphraseMeta.appendChild(passphrase);
    } else {
      passphraseMeta.appendChild(el('span', { text: 'Passphrase: [none]' }));
    }

    header.appendChild(meta);
    header.appendChild(passphraseMeta);
    groupEl.appendChild(header);

    const list = el('div', { className: 'derived-list' });
    group.rows.forEach((row) => {
      const item = el('div', { className: 'derived-item' });
      const info = el('div', {}, [
        el('p', { text: `#${rowNumber}` }),
        el('p', { text: `Index ${row.index}` })
      ]);
      item.appendChild(info);
      item.appendChild(el('code', { text: row.address }));
      list.appendChild(item);
      rowNumber += 1;
    });
    groupEl.appendChild(list);
    container.appendChild(groupEl);
    groupIndex += 1;
  });

  attachRevealHandlers(container);
};

const handleDeriveAddresses = () => {
  if (!state.decrypted) return;
  const rows: Array<{
    seedLabel: string;
    path: string;
    passphrase: string;
    passphraseLabel: string;
    index: number;
    address: string;
  }> = [];
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
          passphraseLabel: pathConfig.passphrase ? pathConfig.passphraseLabel ?? '' : '',
          index: address.index,
          address: address.address
        });
      });
    });
  });
  state.derivedRows = rows;
  renderDerivedAddresses();
  scheduleAutoClear();
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
  scheduleAutoClear();
};

const RATE_LIMIT_KEY = vault.payload.slice(0, 24);
const RATE_LIMIT_MAX_MS = 30000;
const RATE_LIMIT_STORAGE_KEY = `seedVaultAttempt:${RATE_LIMIT_KEY}`;

const loadRateLimit = () => {
  if (typeof localStorage === 'undefined') return { count: 0, lastAttempt: 0 };
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return { count: 0, lastAttempt: 0 };
    const parsed = JSON.parse(raw) as { count?: number; lastAttempt?: number };
    if (typeof parsed.count === 'number' && typeof parsed.lastAttempt === 'number') {
      return { count: parsed.count, lastAttempt: parsed.lastAttempt };
    }
  } catch {
    // Ignore invalid data.
  }
  return { count: 0, lastAttempt: 0 };
};

const saveRateLimit = (entry: { count: number; lastAttempt: number }) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage errors.
  }
};

const clearRateLimit = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const enforceRateLimit = () => {
  const entry = loadRateLimit();
  const now = Date.now();
  const delay = Math.min(Math.pow(2, entry.count) * 1000, RATE_LIMIT_MAX_MS);
  const elapsed = now - entry.lastAttempt;
  if (elapsed < delay) {
    const waitSeconds = Math.ceil((delay - elapsed) / 1000);
    throw new Error(`Too many attempts. Please wait ${waitSeconds} seconds.`);
  }
  return entry;
};

const recordFailure = (entry: { count: number; lastAttempt: number }) => {
  entry.count += 1;
  entry.lastAttempt = Date.now();
  saveRateLimit(entry);
};

const recordSuccess = () => {
  clearRateLimit();
};

const AUTO_CLEAR_MS = 5 * 60 * 1000;
let clearTimerId: number | undefined;

const clearDecryptedState = (reason: 'user' | 'timeout' | 'unload', silent = false) => {
  state.decrypted = undefined;
  state.derivedRows = undefined;
  const seeds = document.querySelector('[data-seeds]');
  if (seeds) seeds.replaceChildren();
  const derived = document.querySelector('[data-derived]');
  if (derived) derived.replaceChildren();
  if (!silent) {
    setStatus(reason === 'timeout' ? 'Decrypted data cleared due to inactivity.' : 'Decrypted data cleared.', 'info');
  }
  if (clearTimerId) window.clearTimeout(clearTimerId);
};

const scheduleAutoClear = () => {
  if (clearTimerId) window.clearTimeout(clearTimerId);
  clearTimerId = window.setTimeout(() => {
    clearDecryptedState('timeout');
  }, AUTO_CLEAR_MS);
};

const renderApp = () => {
  const main = el('main', { className: 'vault' });
  main.appendChild(
    el('header', {}, [
      el('h1', { text: 'Seed Vault' }),
      el('p', { text: 'Offline vault. Decrypt with your password or shares.' })
    ])
  );

  const decryptSection = el('section', { className: 'vault-card' });
  decryptSection.appendChild(el('h2', { text: 'Decrypt Vault' }));
  decryptSection.appendChild(el('p', { className: 'hint', text: vault.hint ? `Hint: ${vault.hint}` : 'No hint stored.' }));
  decryptSection.appendChild(el('div', { className: 'status', dataset: { status: '' }, attrs: { 'data-tone': 'info' } }));
  const decryptContainer = el('div', { className: 'decrypt', dataset: { decrypt: '' } });
  decryptSection.appendChild(decryptContainer);
  const clearActions = el('div', { className: 'actions' }, [
    el('button', { dataset: { clear: '' }, text: 'Clear Decrypted Data' })
  ]);
  decryptSection.appendChild(clearActions);

  const seedsSection = el('section', { className: 'vault-card' }, [
    el('h2', { text: 'Seeds' }),
    el('div', { dataset: { seeds: '' } })
  ]);

  const derivedSection = el('section', { className: 'vault-card' });
  derivedSection.appendChild(el('h2', { text: 'Derived Addresses' }));
  derivedSection.appendChild(
    el('div', { className: 'actions' }, [
      el('button', { dataset: { derive: '' }, text: 'Derive Addresses' }),
      el('button', { dataset: { export: '' }, text: 'Export CSV' })
    ])
  );
  derivedSection.appendChild(el('div', { dataset: { derived: '' } }));

  main.appendChild(decryptSection);
  main.appendChild(seedsSection);
  main.appendChild(derivedSection);
  root.replaceChildren(main);

  const decryptEl = root.querySelector<HTMLDivElement>('[data-decrypt]');
  if (!decryptEl) return;
  decryptEl.replaceChildren();

  if (vault.encryption.type === 'password') {
    decryptEl.appendChild(el('label', { text: 'Password' }));
    const passwordInput = el<HTMLInputElement>('input', {
      type: 'password',
      dataset: { password: '' },
      placeholder: 'Enter password'
    });
    decryptEl.appendChild(passwordInput);
    const decryptButton = el<HTMLButtonElement>('button', { dataset: { decryptBtn: '' }, text: 'Decrypt' });
    decryptEl.appendChild(decryptButton);
    const progress = el<HTMLDivElement>('div', { className: 'progress', hidden: true, dataset: { progress: '' } });
    const progressBar = el<HTMLDivElement>('div', { className: 'bar', dataset: { progressBar: '' } });
    progress.appendChild(progressBar);
    decryptEl.appendChild(progress);

    decryptButton.addEventListener('click', async () => {
      if (!passwordInput.value) {
        setStatus('Enter your password.', 'error');
        return;
      }
      let entry: { count: number; lastAttempt: number };
      try {
        entry = enforceRateLimit();
      } catch (error) {
        setStatus((error as Error).message, 'error');
        return;
      }
      setStatus('Decrypting...', 'info');
      progress.hidden = false;
      progressBar.style.width = '0%';
      try {
        const data = await decryptWithPassword({
          password: passwordInput.value,
          vault,
          kdf: deriveKeyArgon2Wasm,
          onProgress: (value) => {
            progressBar.style.width = `${Math.round(value * 100)}%`;
          }
        });
        recordSuccess();
        state.decrypted = data;
        setStatus('Vault decrypted.', 'info');
        renderSeedList(data);
        passwordInput.value = '';
        scheduleAutoClear();
      } catch (error) {
        recordFailure(entry);
        setStatus((error as Error).message, 'error');
      } finally {
        progress.hidden = true;
      }
    });
  } else {
    const threshold = vault.encryption.threshold;
    const toggle = el('div', { className: 'toggle' }, [
      el('label', {}, [
        el('input', { type: 'radio', name: 'shareFormat', value: 'mnemonic', checked: true }),
        ' Words'
      ]),
      el('label', {}, [el('input', { type: 'radio', name: 'shareFormat', value: 'hex' }), ' Hex'])
    ]);
    decryptEl.appendChild(toggle);

    const shareInputs: HTMLTextAreaElement[] = [];
    for (let index = 0; index < threshold; index += 1) {
      const share = el('div', { className: 'share' }, [
        el('label', { text: `Share ${index + 1}` }),
        el('textarea', { dataset: { shareValue: '' }, placeholder: 'Paste share (e.g. "1: ...")' })
      ]);
      const textarea = share.querySelector<HTMLTextAreaElement>('textarea');
      if (textarea) shareInputs.push(textarea);
      decryptEl.appendChild(share);
    }

    const decryptButton = el<HTMLButtonElement>('button', { dataset: { decryptBtn: '' }, text: 'Decrypt' });
    decryptEl.appendChild(decryptButton);

    decryptButton.addEventListener('click', () => {
      let entry: { count: number; lastAttempt: number } | undefined;
      try {
        const format = (decryptEl.querySelector<HTMLInputElement>('input[name="shareFormat"]:checked')?.value ??
          'mnemonic') as 'mnemonic' | 'hex';
        const shares = shareInputs.map((input) => {
          const value = input.value.trim();
          if (!value) {
            throw new Error('Provide all required shares.');
          }
          return format === 'hex' ? parseShareHex(value) : parseShareMnemonic(value);
        });

        entry = enforceRateLimit();
        const data = decryptWithShamir({ shares, vault });
        recordSuccess();
        state.decrypted = data;
        setStatus('Vault decrypted.', 'info');
        renderSeedList(data);
        shareInputs.forEach((input) => (input.value = ''));
        scheduleAutoClear();
      } catch (error) {
        if (entry) recordFailure(entry);
        setStatus((error as Error).message, 'error');
      }
    });
  }

  root.querySelector<HTMLButtonElement>('[data-derive]')?.addEventListener('click', handleDeriveAddresses);
  root.querySelector<HTMLButtonElement>('[data-export]')?.addEventListener('click', handleExportCsv);
  root.querySelector<HTMLButtonElement>('[data-clear]')?.addEventListener('click', () => {
    clearDecryptedState('user');
  });

  renderDerivedAddresses();
};

window.addEventListener('beforeunload', () => {
  clearDecryptedState('unload', true);
});

renderApp();
