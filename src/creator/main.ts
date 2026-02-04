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

const FAST_CRYPTO = import.meta.env.VITE_FAST_CRYPTO === 'true';
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
      passphrase: ''
    }))
  }));
  state.encryption.password = '';
  state.encryption.confirm = '';
  render();
};

const previewWorker = new Worker(new URL('./derivation/preview.worker.ts', import.meta.url), { type: 'module' });
const previewTimers = new Map<string, number>();

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
    list.innerHTML = path.previewAddresses.map((address) => `<code>${address}</code>`).join('');
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
  setStatus('Generating vault...', 'info');

  try {
    const data = buildVaultData();
    if (state.encryption.mode === 'password') {
      const preset =
        state.encryption.argonPresetId === 'custom'
          ? null
          : ARGON2_PRESETS.find((item) => item.id === state.encryption.argonPresetId) ?? ARGON2_PRESETS[0];
      const selectedParams = preset
        ? {
            timeCost: preset.timeCost,
            memoryCostMB: preset.memoryCostMB,
            parallelism: preset.parallelism
          }
        : {
            timeCost: state.encryption.argonCustom.timeCost,
            memoryCostMB: state.encryption.argonCustom.memoryCostMB,
            parallelism: state.encryption.argonCustom.parallelism
          };
      const params = FAST_CRYPTO ? FAST_PARAMS : selectedParams;
      const vault = await encryptWithPassword({
        password: state.encryption.password,
        hint: state.encryption.hint.trim() || undefined,
        data,
        params,
        kdf: deriveKeyArgon2Worker,
        onProgress: (value) => {
          state.progress = value;
          render();
        }
      });
      const html = buildVaultHtml(vault);
      const filename = `seed-vault-${new Date().toISOString().slice(0, 10)}.html`;
      downloadFile(html, filename);
      state.generated = { vaultHtml: html, shares: [] };
      setStatus('Vault generated and downloaded.', 'info');
    } else {
      const { vault, shares } = encryptWithShamir({
        data,
        threshold: state.encryption.threshold,
        totalShares: state.encryption.totalShares,
        hint: state.encryption.hint.trim() || undefined
      });
      const html = buildVaultHtml(vault);
      const filename = `seed-vault-${new Date().toISOString().slice(0, 10)}.html`;
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

const render = () => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  const totalPreviewCount = state.seeds.reduce(
    (sum, seed) => sum + seed.paths.reduce((pathSum, path) => pathSum + path.deriveCount, 0),
    0
  );
  const showPreviewWarning = totalPreviewCount > 50;
  const argonCustomValidation =
    state.encryption.mode === 'password' && state.encryption.argonPresetId === 'custom'
      ? validateArgon2Params(state.encryption.argonCustom)
      : { valid: true };

  root.innerHTML = `
    <main class="creator">
      <header class="creator__header">
        <h1>Seed Vault Creator</h1>
        <p>Build an offline, self-contained vault file for your Ethereum wallets.</p>
      </header>

      <section class="card">
        <div class="card__header">
          <h2>Seeds</h2>
          <button data-add-seed>Add Seed</button>
        </div>
        <div class="card__body">
          ${showPreviewWarning ? '<p class="helper error">Large preview counts may take time.</p>' : ''}
          ${state.seeds
            .map((seed, seedIndex) => {
              const mnemonicStatus = validateBip39Mnemonic(seed.mnemonic);
              return `
                <div class="seed">
                  <div class="seed__header">
                    <h3>Seed ${seedIndex + 1}</h3>
                    <button data-remove-seed="${seed.id}">Remove</button>
                  </div>
                  <label>Label</label>
                  <input type="text" data-seed-label="${seed.id}" value="${seed.label}" />
                  <label>Mnemonic</label>
                  <textarea data-seed-mnemonic="${seed.id}" placeholder="12, 18, or 24 words">${seed.mnemonic}</textarea>
                  <p class="helper ${mnemonicStatus.valid ? 'ok' : 'error'}">
                    ${mnemonicStatus.valid ? `Valid (${mnemonicStatus.wordCount} words)` : mnemonicStatus.error ?? ''}
                  </p>
                  <div class="paths">
                    <div class="paths__header">
                      <h4>HD Paths</h4>
                      <button data-add-path="${seed.id}">Add Path</button>
                    </div>
                    ${seed.paths
                      .map((path) => {
                        const pathStatus = validateHdPathTemplate(path.path);
                        return `
                          <div class="path">
                            <div class="path__header">
                              <strong>${path.label || 'Path'}</strong>
                              <button data-remove-path="${seed.id}:${path.id}">Remove</button>
                            </div>
                            <label>Label</label>
                            <input type="text" data-path-label="${seed.id}:${path.id}" value="${path.label}" />
                            <label>Preset</label>
                            <select data-path-preset="${seed.id}:${path.id}">
                              ${HD_PATH_PRESETS.map(
                                (preset) => `
                                  <option value="${preset.id}" ${preset.id === path.preset ? 'selected' : ''}>
                                    ${preset.label}
                                  </option>
                                `
                              ).join('')}
                              <option value="custom" ${path.preset === 'custom' ? 'selected' : ''}>Custom</option>
                            </select>
                            <label>Path</label>
                            <input type="text" data-path-value="${seed.id}:${path.id}" value="${path.path}" />
                            <p class="helper ${pathStatus.valid ? 'ok' : 'error'}">
                              ${pathStatus.valid ? 'Path valid' : pathStatus.error ?? ''}
                            </p>
                            <label>Passphrase (optional)</label>
                            <input type="text" data-path-passphrase="${seed.id}:${path.id}" value="${path.passphrase}" />
                            <label>Address Count</label>
                            <input type="number" min="1" max="100" data-path-count="${seed.id}:${path.id}" value="${path.deriveCount}" />
                            <div class="preview" data-preview="${seed.id}:${path.id}">
                              <p class="helper ${path.previewStatus === 'error' ? 'error' : ''}" data-preview-status>
                                ${path.previewMessage}
                              </p>
                              <div class="preview__list" data-preview-list>
                                ${path.previewAddresses.map((address) => `<code>${address}</code>`).join('')}
                              </div>
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </section>

      <section class="card">
        <h2>Encryption</h2>
        <div class="toggle">
          <label>
            <input type="radio" name="mode" value="password" ${
              state.encryption.mode === 'password' ? 'checked' : ''
            } />
            Password
          </label>
          <label>
            <input type="radio" name="mode" value="shamir" ${
              state.encryption.mode === 'shamir' ? 'checked' : ''
            } />
            Shamir Shares
          </label>
        </div>
        ${
          state.encryption.mode === 'password'
            ? `
              <label>Password</label>
              <input type="password" data-password value="${state.encryption.password}" />
              <label>Confirm Password</label>
              <input type="password" data-confirm value="${state.encryption.confirm}" />
              <p class="helper">Strength: <span data-strength>${passwordStrength(
                state.encryption.password
              )}</span>/4</p>
              <label>Security Preset</label>
              <select data-argon-preset>
                ${ARGON2_PRESETS.map(
                  (preset) => `
                    <option value="${preset.id}" ${preset.id === state.encryption.argonPresetId ? 'selected' : ''}>
                      ${preset.label} (${preset.memoryCostMB}MB, t=${preset.timeCost})
                    </option>
                  `
                ).join('')}
                <option value="custom" ${state.encryption.argonPresetId === 'custom' ? 'selected' : ''}>
                  Custom
                </option>
              </select>
              ${
                state.encryption.argonPresetId === 'custom'
                  ? `
                    <div class="row">
                      <label>Time cost (t)</label>
                      <input type="number" min="${DEFAULT_ARGON2_MIN.timeCost}" data-argon-time value="${state.encryption.argonCustom.timeCost}" />
                    </div>
                    <div class="row">
                      <label>Memory (MB)</label>
                      <input type="number" min="${DEFAULT_ARGON2_MIN.memoryCostMB}" data-argon-memory value="${state.encryption.argonCustom.memoryCostMB}" />
                    </div>
                    <div class="row">
                      <label>Parallelism (p)</label>
                      <input type="number" min="${DEFAULT_ARGON2_MIN.parallelism}" data-argon-parallelism value="${state.encryption.argonCustom.parallelism}" />
                    </div>
                    <p class="helper ${argonCustomValidation.valid ? '' : 'error'}" data-argon-error>
                      ${argonCustomValidation.valid ? 'Custom parameters look good.' : argonCustomValidation.error ?? ''}
                    </p>
                  `
                  : '<p class="helper">Higher settings increase security but may take up to 85 seconds on mobile.</p>'
              }
            `
            : `
              <div class="row">
                <label>Threshold (k)</label>
                <input type="number" min="2" max="10" data-threshold value="${state.encryption.threshold}" />
              </div>
              <div class="row">
                <label>Total Shares (n)</label>
                <input type="number" min="${state.encryption.threshold}" max="10" data-total value="${
                state.encryption.totalShares
              }" />
              </div>
            `
        }
        <label>Password Hint (optional)</label>
        <input type="text" data-hint value="${state.encryption.hint}" />
        <p class="helper">Choose between password encryption or Shamir sharing based on your threat model.</p>
      </section>

      <section class="card">
        <h2>Generate Vault</h2>
        <div class="status ${state.statusTone}">${state.status}</div>
        <button class="primary" data-generate ${state.isGenerating ? 'disabled' : ''}>
          ${state.isGenerating ? 'Generating...' : 'Generate Vault'}
        </button>
        <div class="progress" ${state.isGenerating ? '' : 'hidden'}>
          <div class="bar" style="width: ${Math.round(state.progress * 100)}%"></div>
        </div>
        ${
          state.generated && state.generated.shares.length
            ? `
              <div class="shares">
                <h3>Shamir Shares</h3>
                <p class="helper">Record these shares securely. You need ${state.encryption.threshold} shares to decrypt.</p>
                <div class="toggle">
                  <label><input type="radio" name="share-display" value="words" checked /> Words</label>
                  <label><input type="radio" name="share-display" value="hex" /> Hex</label>
                </div>
                ${state.generated.shares
                  .map(
                    (share) => `
                      <div class="share" data-share="${share.id}">
                        <strong>Share ${share.id}</strong>
                        <textarea readonly>${share.words}</textarea>
                        <textarea class="hidden" readonly>${share.hex}</textarea>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </section>
    </main>
  `;

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
