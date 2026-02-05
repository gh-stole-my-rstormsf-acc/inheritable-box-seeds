import { ARGON2_PRESETS, HD_PATH_PRESETS } from '../shared/constants';
import { validateBip39Mnemonic, normalizeMnemonic } from './validation/mnemonic';
import { validateHdPathTemplate } from './validation/hdPath';
import { encryptWithPassword, encryptWithShamir } from '../shared/crypto/vault';
import { buildVaultHtml } from '../vault/template';
import { formatShareHex, formatShareMnemonic } from '../shared/crypto/shamir';
import type { VaultData } from '../shared/types';
import { deriveKeyArgon2Worker } from './crypto/argon2Worker';
import { validateArgon2Params, DEFAULT_ARGON2_MIN } from './validation/argon2';

interface PathForm {
  id: string;
  label: string;
  preset: string;
  path: string;
  passphrase: string;
  passphraseLabel: string;
  deriveCount: number;
  previewStatus: 'idle' | 'computing' | 'error' | 'ready';
  previewMessage: string;
  previewAddresses: string[];
  previewRequestId: number;
}

interface SeedForm {
  id: string;
  label: string;
  mnemonic: string;
  paths: PathForm[];
}

interface EncryptionState {
  mode: 'password' | 'shamir';
  password: string;
  confirm: string;
  hint: string;
  argonPresetId: 'default' | 'high' | 'custom';
  argonCustom: {
    timeCost: number;
    memoryCostMB: number;
    parallelism: number;
  };
  threshold: number;
  totalShares: number;
}

interface GeneratedState {
  vaultHtml: string;
  shares: Array<{ id: number; words: string; hex: string }>;
}

const createPath = (preset = HD_PATH_PRESETS[0]) => ({
  id: crypto.randomUUID(),
  label: preset.label,
  preset: preset.id,
  path: preset.path,
  passphrase: '',
  passphraseLabel: '',
  deriveCount: 10,
  previewStatus: 'idle',
  previewMessage: 'Enter a valid mnemonic and path to preview.',
  previewAddresses: [],
  previewRequestId: 0
});

const createSeed = (): SeedForm => ({
  id: crypto.randomUUID(),
  label: 'Primary Seed',
  mnemonic: '',
  paths: [createPath()]
});

const FAST_CRYPTO_FLAG = import.meta.env.VITE_FAST_CRYPTO === 'true';
if (FAST_CRYPTO_FLAG && import.meta.env.PROD) {
  throw new Error('VITE_FAST_CRYPTO is test-only and must not be enabled in production builds.');
}
const FAST_CRYPTO = FAST_CRYPTO_FLAG && !import.meta.env.PROD;
const FAST_PARAMS = { timeCost: 2, memoryCostMB: 1, parallelism: 1 };

const state = {
  seeds: [createSeed()],
  encryption: {
    mode: 'password',
    password: '',
    confirm: '',
    hint: '',
    argonPresetId: 'high',
    argonCustom: {
      timeCost: DEFAULT_ARGON2_MIN.timeCost,
      memoryCostMB: DEFAULT_ARGON2_MIN.memoryCostMB,
      parallelism: DEFAULT_ARGON2_MIN.parallelism
    },
    threshold: 2,
    totalShares: 3
  } as EncryptionState,
  status: '',
  statusTone: 'info' as 'info' | 'error',
  generated: undefined as GeneratedState | undefined,
  isGenerating: false,
  progress: 0
};

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
  htmlFor?: string;
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
  if (props.htmlFor !== undefined && node instanceof HTMLLabelElement) {
    node.htmlFor = props.htmlFor;
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
  state.status = message;
  state.statusTone = tone;
  render();
};

const passwordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
};

const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const md5Hex = (input: string) => {
  const data = new TextEncoder().encode(input);
  const originalLength = data.length;
  const bitLengthLow = (originalLength * 8) >>> 0;
  const bitLengthHigh = Math.floor((originalLength * 8) / 0x100000000);
  const paddedLength = (((originalLength + 9) >> 6) + 1) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(data);
  buffer[originalLength] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, bitLengthLow, true);
  view.setUint32(paddedLength - 4, bitLengthHigh, true);

  const toUint32 = (value: number) => value >>> 0;
  const leftRotate = (value: number, shift: number) => (value << shift) | (value >>> (32 - shift));
  const wordToHex = (word: number) => {
    const bytes = [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff];
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  }
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const chunk = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) {
      chunk[i] = view.getUint32(offset + i * 4, true);
    }

    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;

    for (let i = 0; i < 64; i += 1) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (bb & cc) | (~bb & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * i + 5) % 16;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * i) % 16;
      }

      const temp = dd;
      dd = cc;
      cc = bb;
      const sum = toUint32(aa + f + k[i] + chunk[g]);
      bb = toUint32(bb + leftRotate(sum, s[i]));
      aa = temp;
    }

    a = toUint32(a + aa);
    b = toUint32(b + bb);
    c = toUint32(c + cc);
    d = toUint32(d + dd);
  }

  return `${wordToHex(a)}${wordToHex(b)}${wordToHex(c)}${wordToHex(d)}`;
};

const validateForm = () => {
  const errors: string[] = [];
  const labels = new Set<string>();

  state.seeds.forEach((seed) => {
    if (!seed.label.trim()) {
      errors.push('Seed labels are required.');
    }
    if (labels.has(seed.label.trim())) {
      errors.push('Seed labels must be unique.');
    }
    labels.add(seed.label.trim());

    const mnemonicResult = validateBip39Mnemonic(seed.mnemonic);
    if (!mnemonicResult.valid) {
      errors.push(`Seed "${seed.label}" mnemonic: ${mnemonicResult.error}`);
    }

    seed.paths.forEach((path) => {
      if (!path.label.trim()) {
        errors.push('Path labels are required.');
      }
      if (path.passphrase.trim() && !path.passphraseLabel.trim()) {
        errors.push(`Path "${path.label}" passphrase label is required when a passphrase is set.`);
      }
      const pathResult = validateHdPathTemplate(path.path);
      if (!pathResult.valid) {
        errors.push(`Path "${path.label}": ${pathResult.error}`);
      }
      if (path.deriveCount < 1 || path.deriveCount > 100) {
        errors.push('Address count must be between 1 and 100.');
      }
    });
  });

  if (state.encryption.mode === 'password') {
    if (!state.encryption.password) {
      errors.push('Password is required.');
    }
    if (state.encryption.password !== state.encryption.confirm) {
      errors.push('Password confirmation does not match.');
    }
    if (state.encryption.argonPresetId === 'custom') {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      if (!validation.valid) {
        errors.push(validation.error ?? 'Invalid Argon2 parameters.');
      }
    }
  } else {
    if (state.encryption.threshold < 2 || state.encryption.totalShares < state.encryption.threshold) {
      errors.push('Shamir threshold must be at least 2 and <= total shares.');
    }
  }

  return errors;
};

const buildVaultData = (): VaultData => ({
  seeds: state.seeds.map((seed) => ({
    label: seed.label.trim(),
    mnemonic: normalizeMnemonic(seed.mnemonic),
    paths: seed.paths.map((path) => ({
      label: path.label.trim(),
      path: path.path.trim(),
      passphrase: path.passphrase,
      passphraseLabel: path.passphrase ? path.passphraseLabel.trim() : '',
      deriveCount: path.deriveCount
    }))
  }))
});

const clearSensitiveState = () => {
  state.seeds = state.seeds.map((seed) => ({
    ...seed,
    mnemonic: '',
    paths: seed.paths.map((path) => ({
      ...path,
      passphrase: '',
      passphraseLabel: ''
    }))
  }));
  state.encryption.password = '';
  state.encryption.confirm = '';
  render();
};

const previewWorker = new Worker(new URL('./derivation/preview.worker.ts', import.meta.url), { type: 'module' });
const previewTimers = new Map<string, number>();

const renderPreviewTable = (addresses: string[]) => {
  if (!addresses.length) return null;
  const table = el<HTMLTableElement>('table', { className: 'preview-table' });
  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', { text: '#' }));
  headRow.appendChild(el('th', { text: 'Address' }));
  thead.appendChild(headRow);
  const tbody = el('tbody');
  addresses.forEach((address, index) => {
    const row = el('tr');
    row.appendChild(el('td', { className: 'preview-table__index', text: String(index) }));
    const codeCell = el('td');
    const code = el('code', { text: address });
    codeCell.appendChild(code);
    row.appendChild(codeCell);
    tbody.appendChild(row);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
};

const updatePreviewUI = (seedId: string, pathId: string, path: PathForm) => {
  const preview = document.querySelector<HTMLDivElement>(`[data-preview="${seedId}:${pathId}"]`);
  if (!preview) return;
  const status = preview.querySelector<HTMLParagraphElement>('[data-preview-status]');
  if (status) {
    status.textContent = path.previewMessage;
    status.classList.toggle('error', path.previewStatus === 'error');
  }
  const list = preview.querySelector<HTMLDivElement>('[data-preview-list]');
  if (list) {
    list.replaceChildren();
    const table = renderPreviewTable(path.previewAddresses);
    if (table) list.appendChild(table);
  }
};

previewWorker.onmessage = (event) => {
  const { requestId, seedId, pathId, addresses, error } = event.data as {
    requestId: number;
    seedId: string;
    pathId: string;
    addresses?: string[];
    error?: string;
  };

  const seed = state.seeds.find((item) => item.id === seedId);
  const path = seed?.paths.find((item) => item.id === pathId);
  if (!seed || !path) return;
  if (requestId !== path.previewRequestId) return;

  if (error) {
    path.previewStatus = 'error';
    path.previewMessage = error;
    path.previewAddresses = [];
  } else {
    path.previewStatus = 'ready';
    path.previewAddresses = addresses ?? [];
    path.previewMessage = `${path.previewAddresses.length} address${path.previewAddresses.length === 1 ? '' : 'es'}`;
  }
  updatePreviewUI(seedId, pathId, path);
};

const schedulePreview = (seed: SeedForm, path: PathForm) => {
  const key = `${seed.id}:${path.id}`;
  const existing = previewTimers.get(key);
  if (existing) window.clearTimeout(existing);

  const timeoutId = window.setTimeout(() => {
    const mnemonicStatus = validateBip39Mnemonic(seed.mnemonic);
    const pathStatus = validateHdPathTemplate(path.path);

    if (!mnemonicStatus.valid) {
      path.previewStatus = 'error';
      path.previewMessage = mnemonicStatus.error ?? 'Invalid mnemonic.';
      path.previewAddresses = [];
      updatePreviewUI(seed.id, path.id, path);
      return;
    }
    if (!pathStatus.valid) {
      path.previewStatus = 'error';
      path.previewMessage = pathStatus.error ?? 'Invalid path.';
      path.previewAddresses = [];
      updatePreviewUI(seed.id, path.id, path);
      return;
    }
    if (path.deriveCount < 1 || path.deriveCount > 100) {
      path.previewStatus = 'error';
      path.previewMessage = 'Address count must be between 1 and 100.';
      path.previewAddresses = [];
      updatePreviewUI(seed.id, path.id, path);
      return;
    }

    path.previewStatus = 'computing';
    path.previewMessage = 'Computing...';
    path.previewAddresses = [];
    path.previewRequestId += 1;
    const requestId = path.previewRequestId;
    updatePreviewUI(seed.id, path.id, path);

    previewWorker.postMessage({
      requestId,
      seedId: seed.id,
      pathId: path.id,
      mnemonic: normalizeMnemonic(seed.mnemonic),
      passphrase: path.passphrase,
      path: path.path,
      count: path.deriveCount
    });
  }, 400);

  previewTimers.set(key, timeoutId);
};

const handleGenerate = async () => {
  if (state.isGenerating) return;
  const errors = validateForm();
  if (errors.length) {
    setStatus(errors[0], 'error');
    return;
  }

  state.isGenerating = true;
  state.progress = 0;
  render();

  try {
    const data = buildVaultData();
    const onProgress = (value: number) => {
      state.progress = value;
      render();
    };

    if (state.encryption.mode === 'password') {
      const vault = await encryptWithPassword({
        password: state.encryption.password,
        data,
        hint: state.encryption.hint.trim() || undefined,
        params: FAST_CRYPTO ? FAST_PARAMS : undefined,
        kdf: deriveKeyArgon2Worker,
        onProgress
      });
      const html = buildVaultHtml(vault);
      const filename = `seed-vault-${md5Hex(html)}.html`;
      downloadFile(html, filename);
      state.generated = {
        vaultHtml: html,
        shares: []
      };
      setStatus('Vault generated and downloaded. Record your password.', 'info');
    } else {
      const { vault, shares } = encryptWithShamir({
        data,
        threshold: state.encryption.threshold,
        totalShares: state.encryption.totalShares,
        hint: state.encryption.hint.trim() || undefined
      });
      const html = buildVaultHtml(vault);
      const filename = `seed-vault-${md5Hex(html)}.html`;
      downloadFile(html, filename);
      state.generated = {
        vaultHtml: html,
        shares: shares.map((share) => ({
          id: share.id,
          words: formatShareMnemonic(share),
          hex: formatShareHex(share)
        }))
      };
      setStatus('Vault generated and downloaded. Record your shares.', 'info');
    }
    clearSensitiveState();
  } catch (error) {
    setStatus((error as Error).message, 'error');
  } finally {
    state.isGenerating = false;
    state.progress = 0;
    render();
  }
};

const buildSeedsSection = () => {
  const totalPreviewCount = state.seeds.reduce(
    (sum, seed) => sum + seed.paths.reduce((pathSum, path) => pathSum + path.deriveCount, 0),
    0
  );
  const showPreviewWarning = totalPreviewCount > 50;

  const section = el('section', { className: 'card' });
  const header = el('div', { className: 'card__header' }, [
    el('h2', { text: 'Seeds' }),
    el('button', { dataset: { addSeed: '' }, text: 'Add Seed' })
  ]);
  const body = el('div', { className: 'card__body' });
  if (showPreviewWarning) {
    body.appendChild(el('p', { className: 'helper error', text: 'Large preview counts may take time.' }));
  }

  state.seeds.forEach((seed, seedIndex) => {
    const seedEl = el('div', { className: 'seed' });
    const seedHeader = el('div', { className: 'seed__header' }, [
      el('h3', { text: `Seed ${seedIndex + 1}` }),
      el('button', { dataset: { removeSeed: seed.id }, text: 'Remove' })
    ]);
    seedEl.appendChild(seedHeader);

    seedEl.appendChild(el('label', { text: 'Label' }));
    seedEl.appendChild(
      el('input', {
        type: 'text',
        dataset: { seedLabel: seed.id },
        value: seed.label
      })
    );

    seedEl.appendChild(el('label', { text: 'Mnemonic' }));
    seedEl.appendChild(
      el('textarea', {
        dataset: { seedMnemonic: seed.id },
        placeholder: '12, 18, or 24 words',
        value: seed.mnemonic
      })
    );

    const mnemonicStatus = validateBip39Mnemonic(seed.mnemonic);
    seedEl.appendChild(
      el('p', {
        className: `helper ${mnemonicStatus.valid ? 'ok' : 'error'}`,
        text: mnemonicStatus.valid ? `Valid (${mnemonicStatus.wordCount} words)` : mnemonicStatus.error ?? ''
      })
    );

    const pathsContainer = el('div', { className: 'paths' });
    pathsContainer.appendChild(
      el('div', { className: 'paths__header' }, [
        el('h4', { text: 'HD Paths' }),
        el('button', { dataset: { addPath: seed.id }, text: 'Add Path' })
      ])
    );

    seed.paths.forEach((path) => {
      const pathStatus = validateHdPathTemplate(path.path);
      const pathEl = el('div', { className: 'path' });
      pathEl.appendChild(
        el('div', { className: 'path__header' }, [
          el('strong', { text: path.label || 'Path' }),
          el('button', { dataset: { removePath: `${seed.id}:${path.id}` }, text: 'Remove' })
        ])
      );

      pathEl.appendChild(el('label', { text: 'Label' }));
      pathEl.appendChild(
        el('input', {
          type: 'text',
          dataset: { pathLabel: `${seed.id}:${path.id}` },
          value: path.label
        })
      );

      pathEl.appendChild(el('label', { text: 'Preset' }));
      const select = el<HTMLSelectElement>('select', { dataset: { pathPreset: `${seed.id}:${path.id}` } });
      HD_PATH_PRESETS.forEach((preset) => {
        const option = el<HTMLOptionElement>('option', {
          attrs: { value: preset.id },
          text: preset.label
        });
        if (preset.id === path.preset) option.selected = true;
        select.appendChild(option);
      });
      const customOption = el<HTMLOptionElement>('option', {
        attrs: { value: 'custom' },
        text: 'Custom'
      });
      if (path.preset === 'custom') customOption.selected = true;
      select.appendChild(customOption);
      pathEl.appendChild(select);

      pathEl.appendChild(el('label', { text: 'Path' }));
      pathEl.appendChild(
        el('input', {
          type: 'text',
          dataset: { pathValue: `${seed.id}:${path.id}` },
          value: path.path
        })
      );
      pathEl.appendChild(
        el('p', {
          className: `helper ${pathStatus.valid ? 'ok' : 'error'}`,
          text: pathStatus.valid ? 'Path valid' : pathStatus.error ?? ''
        })
      );

      pathEl.appendChild(el('label', { text: 'Passphrase (optional)' }));
      pathEl.appendChild(
        el('input', {
          type: 'text',
          dataset: { pathPassphrase: `${seed.id}:${path.id}` },
          value: path.passphrase
        })
      );

      pathEl.appendChild(el('label', { text: 'Passphrase Label' }));
      pathEl.appendChild(
        el('input', {
          type: 'text',
          dataset: { pathPassphraseLabel: `${seed.id}:${path.id}` },
          value: path.passphraseLabel,
          placeholder: 'Required if passphrase is set'
        })
      );

      pathEl.appendChild(el('label', { text: 'Address Count' }));
      pathEl.appendChild(
        el('input', {
          type: 'number',
          min: '1',
          max: '100',
          dataset: { pathCount: `${seed.id}:${path.id}` },
          value: String(path.deriveCount)
        })
      );

      const preview = el('div', { className: 'preview', dataset: { preview: `${seed.id}:${path.id}` } });
      preview.appendChild(
        el('p', {
          className: `helper ${path.previewStatus === 'error' ? 'error' : ''}`,
          dataset: { previewStatus: '' },
          text: path.previewMessage
        })
      );
      const previewList = el('div', { className: 'preview__list', dataset: { previewList: '' } });
      const previewTable = renderPreviewTable(path.previewAddresses);
      if (previewTable) previewList.appendChild(previewTable);
      preview.appendChild(previewList);

      pathEl.appendChild(preview);
      pathsContainer.appendChild(pathEl);
    });

    seedEl.appendChild(pathsContainer);
    body.appendChild(seedEl);
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
};

const buildEncryptionSection = () => {
  const argonCustomValidation =
    state.encryption.mode === 'password' && state.encryption.argonPresetId === 'custom'
      ? validateArgon2Params(state.encryption.argonCustom)
      : { valid: true };

  const section = el('section', { className: 'card' });
  section.appendChild(el('h2', { text: 'Encryption' }));

  const toggle = el('div', { className: 'toggle' });
  const passwordLabel = el('label');
  const passwordRadio = el<HTMLInputElement>('input', {
    type: 'radio',
    name: 'mode',
    value: 'password',
    checked: state.encryption.mode === 'password'
  });
  passwordLabel.appendChild(passwordRadio);
  passwordLabel.appendChild(document.createTextNode(' Password'));

  const shamirLabel = el('label');
  const shamirRadio = el<HTMLInputElement>('input', {
    type: 'radio',
    name: 'mode',
    value: 'shamir',
    checked: state.encryption.mode === 'shamir'
  });
  shamirLabel.appendChild(shamirRadio);
  shamirLabel.appendChild(document.createTextNode(' Shamir Shares'));

  toggle.appendChild(passwordLabel);
  toggle.appendChild(shamirLabel);
  section.appendChild(toggle);

  if (state.encryption.mode === 'password') {
    section.appendChild(el('label', { text: 'Password' }));
    section.appendChild(
      el('input', {
        type: 'password',
        dataset: { password: '' },
        value: state.encryption.password
      })
    );
    section.appendChild(el('label', { text: 'Confirm Password' }));
    section.appendChild(
      el('input', {
        type: 'password',
        dataset: { confirm: '' },
        value: state.encryption.confirm
      })
    );
    const strength = el('span', { dataset: { strength: '' }, text: String(passwordStrength(state.encryption.password)) });
    const helper = el('p', { className: 'helper' });
    helper.appendChild(document.createTextNode('Strength: '));
    helper.appendChild(strength);
    helper.appendChild(document.createTextNode('/4'));
    section.appendChild(helper);

    section.appendChild(el('label', { text: 'Security Preset' }));
    const presetSelect = el<HTMLSelectElement>('select', { dataset: { argonPreset: '' } });
    ARGON2_PRESETS.forEach((preset) => {
      const option = el<HTMLOptionElement>('option', {
        attrs: { value: preset.id },
        text: `${preset.label} (${preset.memoryCostMB}MB, t=${preset.timeCost})`
      });
      if (preset.id === state.encryption.argonPresetId) option.selected = true;
      presetSelect.appendChild(option);
    });
    const customOption = el<HTMLOptionElement>('option', {
      attrs: { value: 'custom' },
      text: 'Custom'
    });
    if (state.encryption.argonPresetId === 'custom') customOption.selected = true;
    presetSelect.appendChild(customOption);
    section.appendChild(presetSelect);

    if (state.encryption.argonPresetId === 'custom') {
      const timeRow = el('div', { className: 'row' }, [
        el('label', { text: 'Time cost (t)' }),
        el('input', {
          type: 'number',
          min: String(DEFAULT_ARGON2_MIN.timeCost),
          dataset: { argonTime: '' },
          value: String(state.encryption.argonCustom.timeCost)
        })
      ]);
      const memoryRow = el('div', { className: 'row' }, [
        el('label', { text: 'Memory (MB)' }),
        el('input', {
          type: 'number',
          min: String(DEFAULT_ARGON2_MIN.memoryCostMB),
          dataset: { argonMemory: '' },
          value: String(state.encryption.argonCustom.memoryCostMB)
        })
      ]);
      const parallelRow = el('div', { className: 'row' }, [
        el('label', { text: 'Parallelism (p)' }),
        el('input', {
          type: 'number',
          min: String(DEFAULT_ARGON2_MIN.parallelism),
          dataset: { argonParallelism: '' },
          value: String(state.encryption.argonCustom.parallelism)
        })
      ]);
      section.appendChild(timeRow);
      section.appendChild(memoryRow);
      section.appendChild(parallelRow);
      section.appendChild(
        el('p', {
          className: `helper ${argonCustomValidation.valid ? '' : 'error'}`,
          dataset: { argonError: '' },
          text: argonCustomValidation.valid ? 'Custom parameters look good.' : argonCustomValidation.error ?? ''
        })
      );
    } else {
      section.appendChild(
        el('p', {
          className: 'helper',
          text: 'Higher settings increase security but may take up to 85 seconds on mobile.'
        })
      );
    }
  } else {
    const thresholdRow = el('div', { className: 'row' }, [
      el('label', { text: 'Threshold (k)' }),
      el('input', {
        type: 'number',
        min: '2',
        max: '10',
        dataset: { threshold: '' },
        value: String(state.encryption.threshold)
      })
    ]);
    const totalRow = el('div', { className: 'row' }, [
      el('label', { text: 'Total Shares (n)' }),
      el('input', {
        type: 'number',
        min: String(state.encryption.threshold),
        max: '10',
        dataset: { total: '' },
        value: String(state.encryption.totalShares)
      })
    ]);
    section.appendChild(thresholdRow);
    section.appendChild(totalRow);
  }

  section.appendChild(el('label', { text: 'Password Hint (optional)' }));
  section.appendChild(
    el('input', {
      type: 'text',
      dataset: { hint: '' },
      value: state.encryption.hint
    })
  );
  section.appendChild(
    el('p', {
      className: 'helper',
      text: 'Choose between password encryption or Shamir sharing based on your threat model.'
    })
  );

  return section;
};

const buildGenerateSection = () => {
  const section = el('section', { className: 'card' });
  section.appendChild(el('h2', { text: 'Generate Vault' }));
  section.appendChild(el('div', { className: `status ${state.statusTone}`, text: state.status }));

  section.appendChild(
    el('button', {
      className: 'primary',
      dataset: { generate: '' },
      disabled: state.isGenerating,
      text: state.isGenerating ? 'Generating...' : 'Generate Vault'
    })
  );

  const progress = el('div', { className: 'progress', hidden: !state.isGenerating });
  const bar = el('div', { className: 'bar', attrs: { style: `width: ${Math.round(state.progress * 100)}%` } });
  progress.appendChild(bar);
  section.appendChild(progress);

  if (state.generated && state.generated.shares.length) {
    const sharesEl = el('div', { className: 'shares' });
    sharesEl.appendChild(el('h3', { text: 'Shamir Shares' }));
    sharesEl.appendChild(
      el('p', {
        className: 'helper',
        text: `Record these shares securely. You need ${state.encryption.threshold} shares to decrypt.`
      })
    );
    const toggle = el('div', { className: 'toggle' });
    const wordsLabel = el('label');
    wordsLabel.appendChild(
      el('input', { type: 'radio', name: 'share-display', value: 'words', checked: true })
    );
    wordsLabel.appendChild(document.createTextNode(' Words'));
    const hexLabel = el('label');
    hexLabel.appendChild(el('input', { type: 'radio', name: 'share-display', value: 'hex' }));
    hexLabel.appendChild(document.createTextNode(' Hex'));
    toggle.appendChild(wordsLabel);
    toggle.appendChild(hexLabel);
    sharesEl.appendChild(toggle);

    state.generated.shares.forEach((share) => {
      const shareEl = el('div', { className: 'share', dataset: { share: String(share.id) } });
      shareEl.appendChild(el('strong', { text: `Share ${share.id}` }));
      shareEl.appendChild(el('textarea', { readOnly: true, value: share.words }));
      shareEl.appendChild(el('textarea', { className: 'hidden', readOnly: true, value: share.hex }));
      sharesEl.appendChild(shareEl);
    });

    section.appendChild(sharesEl);
  }

  return section;
};

const buildApp = () => {
  const main = el('main', { className: 'creator' });
  const header = el('header', { className: 'creator__header' }, [
    el('h1', { text: 'Seed Vault Creator' }),
    el('p', { text: 'Build an offline, self-contained vault file for your Ethereum wallets.' })
  ]);
  main.appendChild(header);
  main.appendChild(buildSeedsSection());
  main.appendChild(buildEncryptionSection());
  main.appendChild(buildGenerateSection());
  return main;
};

const render = () => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  root.replaceChildren(buildApp());

  root.querySelector<HTMLButtonElement>('[data-add-seed]')?.addEventListener('click', () => {
    state.seeds.push(createSeed());
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-remove-seed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.seeds = state.seeds.filter((seed) => seed.id !== btn.dataset.removeSeed);
      if (state.seeds.length === 0) state.seeds.push(createSeed());
      render();
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-seed-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const seed = state.seeds.find((s) => s.id === input.dataset.seedLabel);
      if (seed) seed.label = input.value;
    });
  });

  root.querySelectorAll<HTMLTextAreaElement>('[data-seed-mnemonic]').forEach((input) => {
    input.addEventListener('input', () => {
      const seed = state.seeds.find((s) => s.id === input.dataset.seedMnemonic);
      if (seed) seed.mnemonic = input.value;
      if (seed) {
        seed.paths.forEach((path) => schedulePreview(seed, path));
      }
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-add-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const seed = state.seeds.find((s) => s.id === btn.dataset.addPath);
      if (!seed) return;
      seed.paths.push(createPath());
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-remove-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [seedId, pathId] = (btn.dataset.removePath ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      if (!seed) return;
      seed.paths = seed.paths.filter((path) => path.id !== pathId);
      if (seed.paths.length === 0) seed.paths.push(createPath());
      render();
    });
  });

  root.querySelectorAll<HTMLSelectElement>('[data-path-preset]').forEach((select) => {
    select.addEventListener('change', () => {
      const [seedId, pathId] = (select.dataset.pathPreset ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (!path) return;
      const preset = HD_PATH_PRESETS.find((p) => p.id === select.value);
      if (preset) {
        path.preset = preset.id;
        path.path = preset.path;
        path.label = preset.label;
      } else {
        path.preset = 'custom';
      }
      schedulePreview(seed, path);
      render();
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-path-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathLabel ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) path.label = input.value;
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-path-value]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathValue ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        path.path = input.value;
        path.preset = 'custom';
        schedulePreview(seed!, path);
      }
      render();
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-path-passphrase]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathPassphrase ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        path.passphrase = input.value;
        schedulePreview(seed!, path);
      }
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-path-passphrase-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathPassphraseLabel ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        path.passphraseLabel = input.value;
      }
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-path-count]').forEach((input) => {
    const handleCountChange = () => {
      const [seedId, pathId] = (input.dataset.pathCount ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        path.deriveCount = Number(input.value);
        schedulePreview(seed!, path);
      }
    };
    input.addEventListener('input', handleCountChange);
    input.addEventListener('change', handleCountChange);
  });

  root.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.encryption.mode = input.value as 'password' | 'shamir';
      render();
    });
  });

  root.querySelector<HTMLInputElement>('[data-password]')?.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    state.encryption.password = value;
    const strengthEl = root.querySelector<HTMLSpanElement>('[data-strength]');
    if (strengthEl) strengthEl.textContent = String(passwordStrength(value));
  });

  root.querySelector<HTMLSelectElement>('[data-argon-preset]')?.addEventListener('change', (event) => {
    state.encryption.argonPresetId = (event.target as HTMLSelectElement).value as 'default' | 'high' | 'custom';
    render();
  });

  root.querySelector<HTMLInputElement>('[data-argon-time]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.timeCost = Number((event.target as HTMLInputElement).value);
    const helper = root.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
  });

  root.querySelector<HTMLInputElement>('[data-argon-memory]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.memoryCostMB = Number((event.target as HTMLInputElement).value);
    const helper = root.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
  });

  root.querySelector<HTMLInputElement>('[data-argon-parallelism]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.parallelism = Number((event.target as HTMLInputElement).value);
    const helper = root.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
  });

  root.querySelector<HTMLInputElement>('[data-confirm]')?.addEventListener('input', (event) => {
    state.encryption.confirm = (event.target as HTMLInputElement).value;
  });

  root.querySelector<HTMLInputElement>('[data-hint]')?.addEventListener('input', (event) => {
    state.encryption.hint = (event.target as HTMLInputElement).value;
  });

  root.querySelector<HTMLInputElement>('[data-threshold]')?.addEventListener('input', (event) => {
    state.encryption.threshold = Number((event.target as HTMLInputElement).value);
    if (state.encryption.totalShares < state.encryption.threshold) {
      state.encryption.totalShares = state.encryption.threshold;
    }
    render();
  });

  root.querySelector<HTMLInputElement>('[data-total]')?.addEventListener('input', (event) => {
    state.encryption.totalShares = Number((event.target as HTMLInputElement).value);
    render();
  });

  root.querySelector<HTMLButtonElement>('[data-generate]')?.addEventListener('click', handleGenerate);

  root.querySelectorAll<HTMLInputElement>('input[name="share-display"]').forEach((input) => {
    input.addEventListener('change', () => {
      const mode = input.value;
      root.querySelectorAll<HTMLDivElement>('.share').forEach((shareEl) => {
        const textareas = shareEl.querySelectorAll<HTMLTextAreaElement>('textarea');
        if (textareas.length < 2) return;
        textareas[0].classList.toggle('hidden', mode !== 'words');
        textareas[1].classList.toggle('hidden', mode !== 'hex');
      });
    });
  });
};

export const renderCreatorApp = () => render();
