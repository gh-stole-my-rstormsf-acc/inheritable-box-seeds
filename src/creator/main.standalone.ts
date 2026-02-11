import { ARGON2_PRESETS, HD_PATH_PRESETS } from '../shared/constants';
import { validateBip39Mnemonic, normalizeMnemonic } from './validation/mnemonic';
import { validateHdPathTemplate } from './validation/hdPath';
import { encryptWithPassword, encryptWithShamir } from '../shared/crypto/vault';
import { buildVaultHtml } from '../vault/template';
import { buildCiphertextMarkdown } from './cipherMarkdown';
import { formatShareHex, formatShareMnemonic } from '../shared/crypto/shamir';
import type { VaultData, VaultFileEntry } from '../shared/types';
import { deriveKeyArgon2Worker } from './crypto/argon2Worker';
import { validateArgon2Params, DEFAULT_ARGON2_MIN } from './validation/argon2';
import { canRemovePath, getOnlyPathTooltip, getTotalPreviewCount, shouldShowLargePreviewWarning } from './pathUi';
import { FAQ_CATEGORIES, FAQ_ENTRY_COUNT } from './faqContent';

interface PathForm {
  id: string;
  label: string;
  labelCustomized: boolean;
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

interface FileForm {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  label: string;
  openHint: string;
  dataBase64: string;
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
  cipherMd: string;
  shares: Array<{ id: number; words: string; hex: string }>;
  fileCount: number;
  totalFileBytes: number;
}

interface PreparedShamirState {
  fingerprint: string;
  vaultHtml: string;
  cipherMd: string;
  shares: Array<{ id: number; words: string; hex: string }>;
  fileCount: number;
  totalFileBytes: number;
}

type WizardStepId = 'seeds' | 'files' | 'paths' | 'security' | 'finalize';
type CreatorView = 'wizard' | 'faq';

interface WizardStep {
  id: WizardStepId;
  title: string;
  subtitle: string;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'seeds',
    title: 'Seeds',
    subtitle: 'Seed phrases and labels'
  },
  {
    id: 'paths',
    title: 'Paths',
    subtitle: 'Derivation paths and passphrases'
  },
  {
    id: 'files',
    title: 'Files',
    subtitle: 'Optional encrypted attachments'
  },
  {
    id: 'security',
    title: 'Security',
    subtitle: 'Encryption and recovery mode'
  },
  {
    id: 'finalize',
    title: 'Finalize',
    subtitle: 'Generate vault and download files'
  }
];

const buildSeedDefaultLabel = (seedIndex: number) => `Seed ${seedIndex + 1}`;

const buildAutoPathLabel = (seedDisplayName: string, presetLabel: string, pathNumber: number) =>
  `[${seedDisplayName}] ${presetLabel} ${pathNumber}`;

const createPath = (preset = HD_PATH_PRESETS[0], label = preset.label, labelCustomized = false) => ({
  id: crypto.randomUUID(),
  label,
  labelCustomized,
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

const createSeed = (seedIndex: number): SeedForm => {
  const seedLabel = buildSeedDefaultLabel(seedIndex);
  const firstPreset = HD_PATH_PRESETS[0];
  const initialPath = createPath(firstPreset, buildAutoPathLabel(seedLabel, firstPreset.label, 1), false);
  return {
  id: crypto.randomUUID(),
  label: seedLabel,
  mnemonic: '',
  paths: [initialPath]
  };
};

const FAST_CRYPTO_FLAG = import.meta.env.VITE_FAST_CRYPTO === 'true';
if (FAST_CRYPTO_FLAG && import.meta.env.PROD) {
  throw new Error('VITE_FAST_CRYPTO is test-only and must not be enabled in production builds.');
}
const FAST_CRYPTO = FAST_CRYPTO_FLAG && !import.meta.env.PROD;
const FAST_PARAMS = { timeCost: 2, memoryCostMB: 1, parallelism: 1 };
const DEFAULT_STATUS_MESSAGE = 'Complete each step to generate your vault.';
const MAX_VAULT_FILE_COUNT = 12;
const MAX_VAULT_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
const CREATOR_HASH_FAQ = '#faq';
const CREATOR_HASH_WIZARD = '#create';
const GITHUB_RELEASES_STANDALONE_URL =
  'https://github.com/gh-stole-my-rstormsf-acc/inheritable-box-seeds/releases/latest/download/seed-vault-standalone.html';

const getViewFromHash = (hash: string): CreatorView =>
  hash.trim().toLowerCase() === CREATOR_HASH_FAQ ? 'faq' : 'wizard';

const getInitialView = (): CreatorView => {
  if (typeof window === 'undefined') return 'wizard';
  return getViewFromHash(window.location.hash);
};

const state = {
  seeds: [createSeed(0)],
  fileAttachmentsEnabled: false,
  files: [] as FileForm[],
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
  status: DEFAULT_STATUS_MESSAGE,
  statusTone: 'info' as 'info' | 'error',
  generated: undefined as GeneratedState | undefined,
  preparedShamir: undefined as PreparedShamirState | undefined,
  isGenerating: false,
  progress: 0,
  stepError: '',
  seedValidationArmed: false,
  filesValidationArmed: false,
  pathValidationArmed: false,
  securityValidationArmed: false,
  currentStep: 'seeds' as WizardStepId,
  view: getInitialView() as CreatorView,
  faqSelectedCategory: FAQ_CATEGORIES[0]?.id ?? '',
  faqExpandedEntries: new Set<string>(),
  securityShowPasswords: false
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

const syncStatusUI = () => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root || state.view !== 'wizard') return false;

  const shouldShowBanner = !(state.currentStep === 'finalize' && state.status === DEFAULT_STATUS_MESSAGE);
  const banner = root.querySelector<HTMLDivElement>('[data-status-banner]');
  if (shouldShowBanner) {
    if (!banner) return false;
    banner.className = `status status--banner ${state.statusTone}`;
    banner.textContent = state.status;
  } else if (banner) {
    banner.remove();
  }

  if (state.currentStep !== 'finalize') return true;
  const shouldShowFinalizeStatus = state.status !== DEFAULT_STATUS_MESSAGE;
  const finalizeStatus = root.querySelector<HTMLDivElement>('[data-finalize-status]');
  if (shouldShowFinalizeStatus) {
    if (!finalizeStatus) return false;
    finalizeStatus.className = `status ${state.statusTone}`;
    finalizeStatus.textContent = state.status;
  } else if (finalizeStatus) {
    finalizeStatus.remove();
  }
  return true;
};

const setStatus = (message: string, tone: 'info' | 'error' = 'info') => {
  state.status = message;
  state.statusTone = tone;
  const statusSynced = syncStatusUI();
  if (!statusSynced) render();
};

const getSelectedFaqCategory = () => {
  const selected = FAQ_CATEGORIES.find((category) => category.id === state.faqSelectedCategory);
  if (selected) return selected;
  const fallback = FAQ_CATEGORIES[0];
  if (fallback) state.faqSelectedCategory = fallback.id;
  return fallback;
};

const syncCreatorHash = (view: CreatorView) => {
  if (typeof window === 'undefined') return;
  const targetHash = view === 'faq' ? CREATOR_HASH_FAQ : CREATOR_HASH_WIZARD;
  if (window.location.hash === targetHash) return;
  const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
  window.history.replaceState(null, '', nextUrl);
};

const setCreatorView = (view: CreatorView, options: { syncHash?: boolean } = {}) => {
  const { syncHash = true } = options;
  if (state.view === view) {
    if (syncHash) syncCreatorHash(view);
    return;
  }
  state.view = view;
  if (syncHash) syncCreatorHash(view);
  render();
};

let hashListenerBound = false;

const bindCreatorHashListener = () => {
  if (hashListenerBound || typeof window === 'undefined') return;
  window.addEventListener('hashchange', () => {
    const nextView = getViewFromHash(window.location.hash);
    if (nextView === state.view) return;
    state.view = nextView;
    render();
  });
  hashListenerBound = true;
};

const invalidateShamirPreparation = () => {
  state.preparedShamir = undefined;
};

const getSeedDisplayName = (seed: SeedForm) => {
  const label = seed.label.trim();
  if (label) return label;
  const index = state.seeds.findIndex((candidate) => candidate.id === seed.id);
  return `Seed ${index >= 0 ? index + 1 : 1}`;
};

const getPathNumberForSeed = (seed: SeedForm, pathId: string) => {
  const pathIndex = seed.paths.findIndex((path) => path.id === pathId);
  return pathIndex >= 0 ? pathIndex + 1 : 1;
};

const buildCurrentAutoPathLabel = (seed: SeedForm, path: PathForm, presetId = path.preset) => {
  const preset = HD_PATH_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return '';
  const seedName = getSeedDisplayName(seed);
  const pathNumber = getPathNumberForSeed(seed, path.id);
  return buildAutoPathLabel(seedName, preset.label, pathNumber);
};

const addPathToSeed = (seedId: string) => {
  const targetSeed = state.seeds.find((seed) => seed.id === seedId);
  if (!targetSeed) return;

  invalidateShamirPreparation();
  const preset = HD_PATH_PRESETS[0];
  const path = createPath(preset);
  const seedName = getSeedDisplayName(targetSeed);
  const nextNumber = targetSeed.paths.length + 1;
  path.label = buildAutoPathLabel(seedName, preset.label, nextNumber);
  path.labelCustomized = false;
  targetSeed.paths.push(path);
  const warningPatched = syncPathsPreviewWarningUI();
  const pathPatched = appendPathCard(targetSeed, path);

  if (!warningPatched || !pathPatched) {
    render();
  }

  schedulePreview(targetSeed, path);
};

const passwordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const sanitizeFileName = (value: string) =>
  value.replace(/[\\/]/g, '-').replace(/[^\w.\- ]+/g, '').trim() || 'vault-file.bin';

const inferOpenHint = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.kdbx')) {
    return 'KeePass database. Open with KeePassXC, KeePass, or compatible apps.';
  }
  if (normalized.endsWith('.1pux') || normalized.endsWith('.1pif')) {
    return '1Password export. Import in 1Password or inspect with trusted archive tools.';
  }
  if (normalized.endsWith('.json')) {
    return 'JSON export. Open in a trusted editor before importing into a password manager.';
  }
  if (normalized.endsWith('.csv')) {
    return 'CSV export. Verify columns before importing into a password manager.';
  }
  if (normalized.endsWith('.zip')) {
    return 'Archive export. Open with trusted unzip tools and inspect contents offline.';
  }
  return 'Open this file with the originating app or trusted offline tooling.';
};

const getEffectiveFiles = () => (state.fileAttachmentsEnabled ? state.files : []);

const buildFileBundleSummary = (data: VaultData) => ({
  fileCount: data.files?.length ?? 0,
  totalFileBytes: (data.files ?? []).reduce((sum, file) => sum + file.size, 0)
});

const addSelectedFiles = async (inputFiles: File[]) => {
  if (!inputFiles.length) return;
  const currentFiles = getEffectiveFiles();
  if (currentFiles.length + inputFiles.length > MAX_VAULT_FILE_COUNT) {
    setStatus(`You can attach up to ${MAX_VAULT_FILE_COUNT} files.`, 'error');
    return;
  }

  const totalBytes = currentFiles.reduce((sum, file) => sum + file.size, 0) + inputFiles.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_VAULT_TOTAL_FILE_BYTES) {
    setStatus(`Attached files exceed ${formatBytes(MAX_VAULT_TOTAL_FILE_BYTES)} total.`, 'error');
    return;
  }

  const converted = await Promise.all(
    inputFiles.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return {
        id: crypto.randomUUID(),
        fileName: sanitizeFileName(file.name),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        label: sanitizeFileName(file.name),
        openHint: inferOpenHint(file.name),
        dataBase64: toBase64(bytes)
      } as FileForm;
    })
  );

  state.files.push(...converted);
  invalidateShamirPreparation();
  render();
  setStatus(`Attached ${converted.length} file${converted.length === 1 ? '' : 's'} for encryption.`, 'info');
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

interface FieldErrorState {
  seedLabel: Set<string>;
  seedMnemonic: Set<string>;
  fileLabel: Set<string>;
  pathLabel: Set<string>;
  pathValue: Set<string>;
  pathPassphraseLabel: Set<string>;
  pathCount: Set<string>;
  password: boolean;
  confirm: boolean;
  argonTime: boolean;
  argonMemory: boolean;
  argonParallelism: boolean;
  threshold: boolean;
  total: boolean;
}

const getPathFieldKey = (seedId: string, pathId: string) => `${seedId}:${pathId}`;

const emptyFieldErrors = (): FieldErrorState => ({
  seedLabel: new Set<string>(),
  seedMnemonic: new Set<string>(),
  fileLabel: new Set<string>(),
  pathLabel: new Set<string>(),
  pathValue: new Set<string>(),
  pathPassphraseLabel: new Set<string>(),
  pathCount: new Set<string>(),
  password: false,
  confirm: false,
  argonTime: false,
  argonMemory: false,
  argonParallelism: false,
  threshold: false,
  total: false
});

const collectFieldErrors = (): FieldErrorState => {
  const fieldErrors = emptyFieldErrors();
  const labelCounts = new Map<string, number>();
  const shouldValidateFiles = state.filesValidationArmed;
  const shouldValidatePaths = state.pathValidationArmed;
  const shouldValidateSecurity = state.securityValidationArmed;

  state.seeds.forEach((seed) => {
    const label = seed.label.trim();
    if (!label) {
      fieldErrors.seedLabel.add(seed.id);
    } else {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }

    if (!validateBip39Mnemonic(seed.mnemonic).valid) {
      fieldErrors.seedMnemonic.add(seed.id);
    }

    if (shouldValidatePaths) {
      seed.paths.forEach((path) => {
        const key = getPathFieldKey(seed.id, path.id);
        if (!path.label.trim()) fieldErrors.pathLabel.add(key);
        if (!validateHdPathTemplate(path.path).valid) fieldErrors.pathValue.add(key);
        if (path.passphrase.trim() && !path.passphraseLabel.trim()) fieldErrors.pathPassphraseLabel.add(key);
        if (path.deriveCount < 1 || path.deriveCount > 100) fieldErrors.pathCount.add(key);
      });
    }
  });

  if (shouldValidateFiles && state.fileAttachmentsEnabled) {
    state.files.forEach((file) => {
      if (!file.label.trim()) {
        fieldErrors.fileLabel.add(file.id);
      }
    });
  }

  state.seeds.forEach((seed) => {
    const label = seed.label.trim();
    if (label && (labelCounts.get(label) ?? 0) > 1) {
      fieldErrors.seedLabel.add(seed.id);
    }
  });

  if (shouldValidateSecurity) {
    if (state.encryption.mode === 'password') {
      if (!state.encryption.password) fieldErrors.password = true;
      if (state.encryption.password !== state.encryption.confirm) fieldErrors.confirm = true;
      if (state.encryption.argonPresetId === 'custom' && !validateArgon2Params(state.encryption.argonCustom).valid) {
        fieldErrors.argonTime = true;
        fieldErrors.argonMemory = true;
        fieldErrors.argonParallelism = true;
      }
    } else if (state.encryption.threshold < 2 || state.encryption.totalShares < state.encryption.threshold) {
      fieldErrors.threshold = true;
      fieldErrors.total = true;
    }
  }

  return fieldErrors;
};

const hasFieldError = (fieldErrors: FieldErrorState, group: keyof FieldErrorState, key?: string) => {
  const target = fieldErrors[group];
  if (target instanceof Set) {
    return key ? target.has(key) : false;
  }
  return Boolean(target);
};

const validateSeedsSection = () => {
  const errors: string[] = [];
  const labels = new Set<string>();

  state.seeds.forEach((seed, index) => {
    const label = seed.label.trim();
    if (!label) {
      errors.push('Seed labels are required.');
    }
    if (label && labels.has(label)) {
      errors.push('Seed labels must be unique.');
    }
    labels.add(label);

    const mnemonicResult = validateBip39Mnemonic(seed.mnemonic);
    if (!mnemonicResult.valid) {
      errors.push(`Seed ${index + 1} mnemonic: ${mnemonicResult.error}`);
    }
  });

  return errors;
};

const validatePathsSection = () => {
  const errors: string[] = [];

  state.seeds.forEach((seed) => {
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

  return errors;
};

const validateFilesSection = () => {
  const errors: string[] = [];
  if (!state.fileAttachmentsEnabled) return errors;

  if (state.files.length === 0) {
    errors.push('Attach at least one file or disable encrypted file attachments.');
  }

  if (state.files.length > MAX_VAULT_FILE_COUNT) {
    errors.push(`You can attach up to ${MAX_VAULT_FILE_COUNT} files.`);
  }

  const totalBytes = state.files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_VAULT_TOTAL_FILE_BYTES) {
    errors.push(`Attached files exceed ${formatBytes(MAX_VAULT_TOTAL_FILE_BYTES)} total.`);
  }

  state.files.forEach((file) => {
    if (!file.label.trim()) {
      errors.push(`File label is required for "${file.fileName}".`);
    }
  });

  return errors;
};

const validateSecuritySection = () => {
  const errors: string[] = [];

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
  } else if (state.encryption.threshold < 2 || state.encryption.totalShares < state.encryption.threshold) {
    errors.push('Shamir threshold must be at least 2 and <= total shares.');
  }

  return errors;
};

const validateForm = () => [
  ...validateSeedsSection(),
  ...validateFilesSection(),
  ...validatePathsSection(),
  ...validateSecuritySection()
];

const validationErrorForStep = (stepId: WizardStepId) => {
  if (stepId === 'seeds') return validateSeedsSection()[0];
  if (stepId === 'files') return validateFilesSection()[0];
  if (stepId === 'paths') return validatePathsSection()[0];
  if (stepId === 'security') return validateSecuritySection()[0];
  return undefined;
};

const getStepIndex = (stepId: WizardStepId) => WIZARD_STEPS.findIndex((step) => step.id === stepId);

const isShamirFinalizeBlocked = () =>
  state.currentStep === 'security' &&
  state.encryption.mode === 'shamir' &&
  !hasPreparedShamirForCurrentState();

const isPostGenerateLocked = () => Boolean(state.generated);

const goToStep = (target: WizardStepId) => {
  const currentIndex = getStepIndex(state.currentStep);
  const targetIndex = getStepIndex(target);
  if (targetIndex <= currentIndex) {
    state.currentStep = target;
    state.stepError = '';
    render();
    return;
  }

  for (let index = currentIndex; index < targetIndex; index += 1) {
    const step = WIZARD_STEPS[index];
    if (step.id === 'seeds') {
      state.seedValidationArmed = true;
    }
    if (step.id === 'files') {
      state.filesValidationArmed = true;
    }
    if (step.id === 'paths') {
      state.pathValidationArmed = true;
    }
    if (step.id === 'security') {
      state.securityValidationArmed = true;
      if (state.encryption.mode === 'shamir' && !hasPreparedShamirForCurrentState()) {
        state.stepError = 'Generate and review Shamir shares before continuing to Finalize.';
        render();
        return;
      }
    }
    const error = validationErrorForStep(step.id);
    if (error) {
      state.stepError = error;
      render();
      return;
    }
  }

  state.currentStep = target;
  state.stepError = '';
  render();
};

const goToNextStep = () => {
  const currentIndex = getStepIndex(state.currentStep);
  if (currentIndex === WIZARD_STEPS.length - 1) return;
  if (state.currentStep === 'seeds') {
    state.seedValidationArmed = true;
  }
  if (state.currentStep === 'files') {
    state.filesValidationArmed = true;
  }
  if (state.currentStep === 'paths') {
    state.pathValidationArmed = true;
  }
  if (state.currentStep === 'security') {
    state.securityValidationArmed = true;
  }
  if (isShamirFinalizeBlocked()) {
    state.stepError = 'Generate and review Shamir shares before continuing to Finalize.';
    render();
    return;
  }
  const error = validationErrorForStep(state.currentStep);
  if (error) {
    state.stepError = error;
    render();
    return;
  }
  state.currentStep = WIZARD_STEPS[currentIndex + 1].id;
  state.stepError = '';
  render();
};

const goToPreviousStep = () => {
  if (isPostGenerateLocked()) return;
  const currentIndex = getStepIndex(state.currentStep);
  if (currentIndex <= 0) return;
  state.currentStep = WIZARD_STEPS[currentIndex - 1].id;
  state.stepError = '';
  render();
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
  })),
  files: getEffectiveFiles().length
    ? getEffectiveFiles().map((file): VaultFileEntry => ({
        label: file.label.trim(),
        fileName: sanitizeFileName(file.fileName),
        mimeType: file.mimeType,
        size: file.size,
        openHint: file.openHint.trim(),
        dataBase64: file.dataBase64
      }))
    : undefined
});

const buildShamirFingerprint = (data: VaultData) =>
  JSON.stringify({
    data,
    threshold: state.encryption.threshold,
    totalShares: state.encryption.totalShares,
    hint: state.encryption.hint.trim() || ''
  });

const hasPreparedShamirForCurrentState = () => {
  if (state.encryption.mode !== 'shamir' || !state.preparedShamir) return false;
  const data = buildVaultData();
  return state.preparedShamir.fingerprint === buildShamirFingerprint(data);
};

const clearSensitiveState = () => {
  invalidateShamirPreparation();
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
  state.securityShowPasswords = false;
  state.fileAttachmentsEnabled = false;
  state.files = [];
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
  if (isPostGenerateLocked()) {
    setStatus('Vault already generated for this session. Refresh to edit and regenerate.', 'info');
    return;
  }
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
      const fileSummary = buildFileBundleSummary(data);
      const vault = await encryptWithPassword({
        password: state.encryption.password,
        data,
        hint: state.encryption.hint.trim() || undefined,
        params: FAST_CRYPTO ? FAST_PARAMS : undefined,
        kdf: deriveKeyArgon2Worker,
        onProgress
      });
      const html = buildVaultHtml(vault);
      const cipherMd = buildCiphertextMarkdown(vault, fileSummary);
      state.generated = {
        vaultHtml: html,
        cipherMd,
        shares: [],
        fileCount: fileSummary.fileCount,
        totalFileBytes: fileSummary.totalFileBytes
      };
      setStatus('Vault generated. Use the download buttons below.', 'info');
    } else {
      const prepared = hasPreparedShamirForCurrentState() ? state.preparedShamir : undefined;
      if (!prepared) {
        throw new Error('Generate and review Shamir shares in Step 3 before finalizing.');
      }
      state.generated = {
        vaultHtml: prepared.vaultHtml,
        cipherMd: prepared.cipherMd,
        shares: prepared.shares,
        fileCount: prepared.fileCount,
        totalFileBytes: prepared.totalFileBytes
      };
      setStatus('Vault generated. Use the download buttons below.', 'info');
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

const handleDownloadVaultHtml = () => {
  if (!state.generated) {
    setStatus('Generate a vault first.', 'error');
    return;
  }
  const filename = `seed-vault-${md5Hex(state.generated.vaultHtml)}.html`;
  downloadFile(state.generated.vaultHtml, filename, 'text/html');
  setStatus('Seed vault HTML download started.', 'info');
};

const handleDownloadCipherMd = () => {
  if (!state.generated) {
    setStatus('Generate a vault first.', 'error');
    return;
  }
  const filename = `seed-vault-cipher-${md5Hex(state.generated.cipherMd)}.md`;
  downloadFile(state.generated.cipherMd, filename, 'text/markdown');
  setStatus('Ciphertext markdown download started.', 'info');
};

const buildWizardStepper = () => {
  const currentIndex = getStepIndex(state.currentStep);
  const nav = el('nav', { className: 'wizard-steps', attrs: { 'aria-label': 'Vault setup steps' } });

  WIZARD_STEPS.forEach((step, index) => {
    const item = el('button', {
      className: `wizard-step ${index === currentIndex ? 'is-active' : ''} ${index < currentIndex ? 'is-complete' : ''}`,
      dataset: { stepLink: step.id },
      attrs: { type: 'button' },
      disabled: true
    });
    item.appendChild(el('span', { className: 'wizard-step__dot', text: String(index + 1) }));
    item.appendChild(
      el('span', { className: 'wizard-step__text' }, [
        el('strong', { text: step.title }),
        el('span', { text: step.subtitle })
      ])
    );
    nav.appendChild(item);
  });

  return nav;
};

const buildSeedCard = (seed: SeedForm, seedIndex: number, fieldErrors: FieldErrorState) => {
  const seedEl = el('div', { className: 'seed', dataset: { seed: seed.id } });
  seedEl.appendChild(
    el('div', { className: 'seed__header' }, [
      el('h3', { text: `Seed ${seedIndex + 1}` }),
      el('button', { dataset: { removeSeed: seed.id }, text: 'Remove' })
    ])
  );

  seedEl.appendChild(el('label', { text: 'Label' }));
  seedEl.appendChild(
    el('input', {
      className: hasFieldError(fieldErrors, 'seedLabel', seed.id) ? 'field-error' : undefined,
      type: 'text',
      dataset: { seedLabel: seed.id },
      value: seed.label
    })
  );

  seedEl.appendChild(el('label', { text: 'Mnemonic (BIP-39)' }));
  const mnemonicStatus = validateBip39Mnemonic(seed.mnemonic);
  const showMnemonicValidation = state.seedValidationArmed || seed.mnemonic.trim().length > 0;
  seedEl.appendChild(
    el('textarea', {
      className: showMnemonicValidation && !mnemonicStatus.valid ? 'field-error' : undefined,
      dataset: { seedMnemonic: seed.id },
      placeholder: '12, 18, or 24 lowercase words',
      value: seed.mnemonic
    })
  );

  seedEl.appendChild(
    el('p', {
      className: `helper ${showMnemonicValidation ? (mnemonicStatus.valid ? 'ok' : 'error') : ''}`,
      dataset: { seedMnemonicStatus: seed.id },
      text: !showMnemonicValidation
        ? 'Enter 12, 18, or 24 words.'
        : mnemonicStatus.valid
          ? `Checksum valid (${mnemonicStatus.wordCount} words)`
          : mnemonicStatus.error ?? ''
    })
  );
  seedEl.appendChild(
    el('p', {
      className: 'helper',
      dataset: { seedPathCount: seed.id },
      text: `${seed.paths.length} path${seed.paths.length === 1 ? '' : 's'} configured`
    })
  );
  return seedEl;
};

const buildSeedsSection = () => {
  const fieldErrors = collectFieldErrors();
  const section = el('section', { className: 'card wizard-card', dataset: { seedsSection: '' } });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [el('h2', { text: 'Step 1: Add Seed Phrases' }), el('p', { className: 'helper', text: 'Add one or more mnemonics first. You will configure paths in the next step.' })]),
      el('button', { className: 'action-add', dataset: { addSeed: '' }, text: 'Add Seed' })
    ])
  );

  const body = el('div', { className: 'card__body', dataset: { seedsBody: '' } });
  state.seeds.forEach((seed, seedIndex) => {
    body.appendChild(buildSeedCard(seed, seedIndex, fieldErrors));
  });
  section.appendChild(body);
  return section;
};

const buildFileCard = (file: FileForm, fieldErrors: FieldErrorState) => {
  const card = el('div', { className: 'vault-file', dataset: { vaultFile: file.id } });
  const metaText = `${file.fileName} • ${formatBytes(file.size)} • ${file.mimeType || 'application/octet-stream'}`;
  card.appendChild(
    el('div', { className: 'vault-file__header' }, [
      el('p', { className: 'vault-file__meta', text: metaText }),
      el('button', { className: 'ghost', dataset: { removeVaultFile: file.id }, text: 'Remove' })
    ])
  );

  card.appendChild(el('label', { text: 'Display Label' }));
  card.appendChild(
    el('input', {
      className: hasFieldError(fieldErrors, 'fileLabel', file.id) ? 'field-error' : undefined,
      type: 'text',
      dataset: { fileLabel: file.id },
      value: file.label
    })
  );

  card.appendChild(el('label', { text: 'Open Hint' }));
  card.appendChild(
    el('input', {
      type: 'text',
      dataset: { fileHint: file.id },
      value: file.openHint,
      placeholder: 'How to open/import this file later'
    })
  );

  return card;
};

const buildFilesSection = () => {
  const fieldErrors = collectFieldErrors();
  const attachedCount = state.files.length;
  const totalBytes = state.files.reduce((sum, file) => sum + file.size, 0);
  const section = el('section', { className: 'card wizard-card', dataset: { filesSection: '' } });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [
        el('h2', { text: 'Step 3: Optional File Attachments' }),
        el('p', {
          className: 'helper',
          text: 'Attach exports or backup files to encrypt inside the same vault package.'
        })
      ])
    ])
  );

  const toggleRow = el('label', { className: 'files-toggle-row' });
  toggleRow.appendChild(
    el('input', {
      type: 'checkbox',
      checked: state.fileAttachmentsEnabled,
      dataset: { filesEnabled: '' }
    })
  );
  toggleRow.appendChild(document.createTextNode(' Encrypt attached files in this vault'));
  section.appendChild(toggleRow);

  section.appendChild(
    el('p', {
      className: 'helper',
      text: `Max ${MAX_VAULT_FILE_COUNT} files, ${formatBytes(MAX_VAULT_TOTAL_FILE_BYTES)} total.`
    })
  );

  if (!state.fileAttachmentsEnabled) {
    section.appendChild(
      el('p', {
        className: 'helper',
        text: 'Disabled. Continue if this vault should only contain seed and path data.'
      })
    );
    return section;
  }

  section.appendChild(
    el('input', {
      type: 'file',
      dataset: { filesInput: '' },
      attrs: { multiple: 'multiple' }
    })
  );

  section.appendChild(
    el('p', {
      className: 'helper',
      text: 'Good targets: KeePass databases (.kdbx), 1Password exports (.1pux/.1pif), Proton Pass exports, or other critical files.'
    })
  );

  section.appendChild(
    el('div', {
      className: 'summary-chip',
      text: `${attachedCount} file${attachedCount === 1 ? '' : 's'} attached • ${formatBytes(totalBytes)}`
    })
  );

  const list = el('div', { className: 'vault-files-list' });
  if (!state.files.length) {
    list.appendChild(el('p', { className: 'helper', text: 'No files attached yet.' }));
  } else {
    state.files.forEach((file) => {
      list.appendChild(buildFileCard(file, fieldErrors));
    });
  }
  section.appendChild(list);
  return section;
};

const syncSeedFieldErrorUI = (seedId: string) => {
  if (state.currentStep !== 'seeds') return;
  const seed = state.seeds.find((item) => item.id === seedId);
  if (!seed) return;

  const fieldErrors = collectFieldErrors();
  const labelInput = document.querySelector<HTMLInputElement>(`[data-seed-label="${seedId}"]`);
  if (labelInput) {
    labelInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'seedLabel', seedId));
  }

  const mnemonicInput = document.querySelector<HTMLTextAreaElement>(`[data-seed-mnemonic="${seedId}"]`);
  const mnemonicStatus = validateBip39Mnemonic(seed.mnemonic);
  const showMnemonicValidation = state.seedValidationArmed || seed.mnemonic.trim().length > 0;
  if (mnemonicInput) {
    mnemonicInput.classList.toggle('field-error', showMnemonicValidation && !mnemonicStatus.valid);
  }

  const mnemonicStatusEl = document.querySelector<HTMLParagraphElement>(`[data-seed-mnemonic-status="${seedId}"]`);
  if (mnemonicStatusEl) {
    mnemonicStatusEl.textContent = !showMnemonicValidation
      ? 'Enter 12, 18, or 24 words.'
      : mnemonicStatus.valid
        ? `Checksum valid (${mnemonicStatus.wordCount} words)`
        : mnemonicStatus.error ?? '';
    mnemonicStatusEl.classList.toggle('ok', showMnemonicValidation && mnemonicStatus.valid);
    mnemonicStatusEl.classList.toggle('error', showMnemonicValidation && !mnemonicStatus.valid);
  }

  const pathCountEl = document.querySelector<HTMLParagraphElement>(`[data-seed-path-count="${seedId}"]`);
  if (pathCountEl) {
    pathCountEl.textContent = `${seed.paths.length} path${seed.paths.length === 1 ? '' : 's'} configured`;
  }
};

const syncAllSeedFieldErrorUI = () => {
  if (state.currentStep !== 'seeds') return;
  state.seeds.forEach((seed) => syncSeedFieldErrorUI(seed.id));
};

const syncFilesFieldErrorUI = () => {
  if (state.currentStep !== 'files') return;
  const fieldErrors = collectFieldErrors();
  state.files.forEach((file) => {
    const labelInput = document.querySelector<HTMLInputElement>(`[data-file-label="${file.id}"]`);
    if (labelInput) {
      labelInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'fileLabel', file.id));
    }
  });
};

const syncFilesSectionUI = () => {
  if (state.currentStep !== 'files') return false;
  const currentSection = document.querySelector<HTMLElement>('[data-files-section]');
  if (!currentSection) return false;

  const nextSection = buildFilesSection();
  currentSection.className = nextSection.className;
  currentSection.replaceChildren(...Array.from(nextSection.childNodes));
  bindFilesFieldListeners(currentSection);
  return true;
};

const syncSecuritySectionUI = () => {
  if (state.currentStep !== 'security') return false;
  const currentSection = document.querySelector<HTMLElement>('[data-security-section]');
  if (!currentSection) return false;

  const nextSection = buildSecuritySection();
  currentSection.className = nextSection.className;
  currentSection.replaceChildren(...Array.from(nextSection.childNodes));
  bindSecurityFieldListeners(currentSection);
  bindShareDisplayListeners(currentSection);
  syncSecurityNextButtonState();
  return true;
};

const bindSeedFieldListeners = (scope: ParentNode) => {
  scope.querySelectorAll<HTMLButtonElement>('[data-remove-seed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.seeds = state.seeds.filter((seed) => seed.id !== btn.dataset.removeSeed);
      if (state.seeds.length === 0) state.seeds.push(createSeed(0));
      invalidateShamirPreparation();
      render();
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-seed-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const seed = state.seeds.find((s) => s.id === input.dataset.seedLabel);
      if (seed) seed.label = input.value;
      invalidateShamirPreparation();
      syncAllSeedFieldErrorUI();
    });
  });

  scope.querySelectorAll<HTMLTextAreaElement>('[data-seed-mnemonic]').forEach((input) => {
    input.addEventListener('input', () => {
      const seed = state.seeds.find((s) => s.id === input.dataset.seedMnemonic);
      if (seed) {
        seed.mnemonic = input.value;
        seed.paths.forEach((path) => schedulePreview(seed, path));
      }
      invalidateShamirPreparation();
      if (seed) syncSeedFieldErrorUI(seed.id);
    });
  });
};

const bindFilesFieldListeners = (scope: ParentNode) => {
  scope.querySelector<HTMLInputElement>('[data-files-enabled]')?.addEventListener('change', (event) => {
    state.fileAttachmentsEnabled = (event.target as HTMLInputElement).checked;
    state.filesValidationArmed = false;
    invalidateShamirPreparation();
    const sectionPatched = syncFilesSectionUI();
    if (!sectionPatched) render();
  });

  scope.querySelector<HTMLInputElement>('[data-files-input]')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await addSelectedFiles(files);
  });

  scope.querySelectorAll<HTMLButtonElement>('[data-remove-vault-file]').forEach((button) => {
    button.addEventListener('click', () => {
      const fileId = button.dataset.removeVaultFile;
      if (!fileId) return;
      state.files = state.files.filter((file) => file.id !== fileId);
      invalidateShamirPreparation();
      render();
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-file-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const fileId = input.dataset.fileLabel;
      const target = state.files.find((file) => file.id === fileId);
      if (!target) return;
      target.label = input.value;
      invalidateShamirPreparation();
      syncFilesFieldErrorUI();
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-file-hint]').forEach((input) => {
    input.addEventListener('input', () => {
      const fileId = input.dataset.fileHint;
      const target = state.files.find((file) => file.id === fileId);
      if (!target) return;
      target.openHint = input.value;
      invalidateShamirPreparation();
    });
  });
};

const appendSeedCard = (seed: SeedForm) => {
  if (state.currentStep !== 'seeds') return false;
  const seedsBody = document.querySelector<HTMLElement>('[data-seeds-body]');
  if (!seedsBody) return false;

  const fieldErrors = collectFieldErrors();
  const seedIndex = state.seeds.findIndex((item) => item.id === seed.id);
  const seedEl = buildSeedCard(seed, seedIndex >= 0 ? seedIndex : state.seeds.length - 1, fieldErrors);
  seedsBody.appendChild(seedEl);
  bindSeedFieldListeners(seedEl);
  return true;
};

const setRemovePathButtonState = (button: HTMLButtonElement, pathCountForSeed: number) => {
  const removable = canRemovePath(pathCountForSeed);
  button.disabled = !removable;
  if (removable) {
    delete button.dataset.tooltip;
    button.removeAttribute('aria-label');
  } else {
    const tooltip = getOnlyPathTooltip(pathCountForSeed);
    button.dataset.tooltip = tooltip;
    button.setAttribute('aria-label', tooltip);
  }
};

const buildPathsPreviewWarning = () =>
  el('p', {
    className: 'helper error',
    text: 'Large preview counts may take time to compute.'
  });

const buildPathCard = (seed: SeedForm, path: PathForm, fieldErrors: FieldErrorState) => {
  const seedName = getSeedDisplayName(seed);
  const pathStatus = validateHdPathTemplate(path.path);
  const pathKey = getPathFieldKey(seed.id, path.id);
  const pathEl = el('div', { className: 'path' });
  const removeButton = el<HTMLButtonElement>('button', { dataset: { removePath: `${seed.id}:${path.id}` }, text: 'Remove' });
  setRemovePathButtonState(removeButton, seed.paths.length);

  pathEl.appendChild(
    el('div', { className: 'path__header' }, [
      el('strong', { dataset: { pathTitle: `${seed.id}:${path.id}` }, text: path.label || 'Path' }),
      removeButton
    ])
  );
  pathEl.appendChild(
    el('p', {
      className: 'path__seed-badge',
      dataset: { pathSeedBadge: `${seed.id}:${path.id}` },
      text: `Seed: ${seedName}`
    })
  );

  pathEl.appendChild(el('label', { text: 'Path Label' }));
  pathEl.appendChild(
    el('input', {
      className: hasFieldError(fieldErrors, 'pathLabel', pathKey) ? 'field-error' : undefined,
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

  pathEl.appendChild(el('label', { text: 'Derivation Path' }));
  pathEl.appendChild(
    el('input', {
      className: hasFieldError(fieldErrors, 'pathValue', pathKey) ? 'field-error' : undefined,
      type: 'text',
      dataset: { pathValue: `${seed.id}:${path.id}` },
      value: path.path
    })
  );
  pathEl.appendChild(
    el('p', {
      className: `helper ${pathStatus.valid ? 'ok' : 'error'}`,
      dataset: { pathStatus: `${seed.id}:${path.id}` },
      text: pathStatus.valid ? 'Path valid' : pathStatus.error ?? ''
    })
  );

  pathEl.appendChild(el('label', { text: 'BIP-39 Passphrase (optional)' }));
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
      className: hasFieldError(fieldErrors, 'pathPassphraseLabel', pathKey) ? 'field-error' : undefined,
      type: 'text',
      dataset: { pathPassphraseLabel: `${seed.id}:${path.id}` },
      value: path.passphraseLabel,
      placeholder: 'Required if passphrase is set'
    })
  );

  pathEl.appendChild(el('label', { text: 'Address Count' }));
  pathEl.appendChild(
    el('input', {
      className: hasFieldError(fieldErrors, 'pathCount', pathKey) ? 'field-error' : undefined,
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

  return pathEl;
};

const buildPathsSection = () => {
  const totalPreviewCount = getTotalPreviewCount(state.seeds);

  const fieldErrors = collectFieldErrors();

  const section = el('section', { className: 'card wizard-card', dataset: { pathsSection: '' } });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [
        el('h2', { text: 'Step 2: Configure HD Paths' }),
        el('p', {
          className: 'helper',
          text: 'Set derivation presets, optional passphrases, and address counts for each seed.'
        })
      ])
    ])
  );

  const previewWarningHost = el('div', { dataset: { pathsPreviewWarningHost: '' } });
  if (shouldShowLargePreviewWarning(totalPreviewCount)) previewWarningHost.appendChild(buildPathsPreviewWarning());
  section.appendChild(previewWarningHost);

  const body = el('div', { className: 'card__body', dataset: { pathsBody: '' } });

  state.seeds.forEach((seed, seedIndex) => {
    const seedName = getSeedDisplayName(seed);
    const seedEl = el('div', { className: 'seed seed--paths', dataset: { seedPaths: seed.id } });
    seedEl.appendChild(
      el('div', { className: 'seed__header' }, [
        el('h3', { text: `Seed ${seedIndex + 1}: ${seedName}` }),
        el('button', {
          className: 'action-add',
          dataset: { addPathSeed: seed.id },
          text: 'Add Path'
        })
      ])
    );

    const pathsContainer = el('div', { className: 'paths', dataset: { seedPathsContainer: seed.id } });
    seed.paths.forEach((path) => {
      pathsContainer.appendChild(buildPathCard(seed, path, fieldErrors));
    });

    seedEl.appendChild(pathsContainer);
    body.appendChild(seedEl);
  });

  section.appendChild(body);
  return section;
};

const syncRemovePathButtonsForSeed = (seed: SeedForm) => {
  seed.paths.forEach((path) => {
    const button = document.querySelector<HTMLButtonElement>(`[data-remove-path="${seed.id}:${path.id}"]`);
    if (!button) return;
    setRemovePathButtonState(button, seed.paths.length);
  });
};

const syncPathFieldErrorUI = (seedId: string, pathId: string) => {
  if (state.currentStep !== 'paths') return;
  const key = getPathFieldKey(seedId, pathId);
  const fieldErrors = collectFieldErrors();
  const labelInput = document.querySelector<HTMLInputElement>(`[data-path-label="${seedId}:${pathId}"]`);
  if (labelInput) labelInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'pathLabel', key));
  const pathInput = document.querySelector<HTMLInputElement>(`[data-path-value="${seedId}:${pathId}"]`);
  if (pathInput) pathInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'pathValue', key));
  const passphraseLabelInput = document.querySelector<HTMLInputElement>(
    `[data-path-passphrase-label="${seedId}:${pathId}"]`
  );
  if (passphraseLabelInput) {
    passphraseLabelInput.classList.toggle(
      'field-error',
      hasFieldError(fieldErrors, 'pathPassphraseLabel', key)
    );
  }
  const countInput = document.querySelector<HTMLInputElement>(`[data-path-count="${seedId}:${pathId}"]`);
  if (countInput) countInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'pathCount', key));
};

const syncPathPresetUI = (seed: SeedForm, path: PathForm) => {
  if (state.currentStep !== 'paths') return;
  const key = `${seed.id}:${path.id}`;
  const select = document.querySelector<HTMLSelectElement>(`[data-path-preset="${key}"]`);
  if (select) select.value = path.preset;

  const title = document.querySelector<HTMLElement>(`[data-path-title="${key}"]`);
  if (title) title.textContent = path.label || 'Path';

  const labelInput = document.querySelector<HTMLInputElement>(`[data-path-label="${key}"]`);
  if (labelInput) labelInput.value = path.label;

  const pathInput = document.querySelector<HTMLInputElement>(`[data-path-value="${key}"]`);
  if (pathInput) pathInput.value = path.path;

  const status = document.querySelector<HTMLParagraphElement>(`[data-path-status="${key}"]`);
  if (status) {
    const pathStatus = validateHdPathTemplate(path.path);
    status.textContent = pathStatus.valid ? 'Path valid' : pathStatus.error ?? '';
    status.classList.toggle('ok', pathStatus.valid);
    status.classList.toggle('error', !pathStatus.valid);
  }

  syncPathFieldErrorUI(seed.id, path.id);
};

const syncSecurityFieldErrorUI = () => {
  if (state.currentStep !== 'security') return;
  const fieldErrors = collectFieldErrors();
  const passwordInput = document.querySelector<HTMLInputElement>('[data-password]');
  if (passwordInput) passwordInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'password'));
  const confirmInput = document.querySelector<HTMLInputElement>('[data-confirm]');
  if (confirmInput) confirmInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'confirm'));
  const argonTimeInput = document.querySelector<HTMLInputElement>('[data-argon-time]');
  if (argonTimeInput) argonTimeInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'argonTime'));
  const argonMemoryInput = document.querySelector<HTMLInputElement>('[data-argon-memory]');
  if (argonMemoryInput) argonMemoryInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'argonMemory'));
  const argonParallelInput = document.querySelector<HTMLInputElement>('[data-argon-parallelism]');
  if (argonParallelInput) {
    argonParallelInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'argonParallelism'));
  }
  const thresholdInput = document.querySelector<HTMLInputElement>('[data-threshold]');
  if (thresholdInput) thresholdInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'threshold'));
  const totalInput = document.querySelector<HTMLInputElement>('[data-total]');
  if (totalInput) totalInput.classList.toggle('field-error', hasFieldError(fieldErrors, 'total'));
};

const syncArgonPresetUI = () => {
  if (state.currentStep !== 'security' || state.encryption.mode !== 'password') return;
  const showCustom = state.encryption.argonPresetId === 'custom';
  const customHost = document.querySelector<HTMLElement>('[data-argon-custom]');
  if (customHost) customHost.hidden = !showCustom;
  const presetHint = document.querySelector<HTMLElement>('[data-argon-preset-hint]');
  if (presetHint) presetHint.hidden = showCustom;

  const helper = document.querySelector<HTMLParagraphElement>('[data-argon-error]');
  if (helper) {
    const validation = validateArgon2Params(state.encryption.argonCustom);
    helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
    helper.classList.toggle('error', !validation.valid);
  }

  syncSecurityFieldErrorUI();
};

const syncSecurityPasswordVisibilityUI = () => {
  if (state.currentStep !== 'security' || state.encryption.mode !== 'password') return;
  const passwordType = state.securityShowPasswords ? 'text' : 'password';
  const passwordInput = document.querySelector<HTMLInputElement>('[data-password]');
  if (passwordInput) passwordInput.type = passwordType;
  const confirmInput = document.querySelector<HTMLInputElement>('[data-confirm]');
  if (confirmInput) confirmInput.type = passwordType;
  const toggle = document.querySelector<HTMLInputElement>('[data-password-visibility]');
  if (toggle) toggle.checked = state.securityShowPasswords;
};

const syncSecurityNextButtonState = () => {
  const nextButton = document.querySelector<HTMLButtonElement>('[data-step-next]');
  if (!nextButton) return;
  nextButton.disabled = state.isGenerating || isShamirFinalizeBlocked();
};

const syncShamirPreparationUI = () => {
  if (state.currentStep !== 'security' || state.encryption.mode !== 'shamir') return;
  const isReady = hasPreparedShamirForCurrentState();
  const status = document.querySelector<HTMLParagraphElement>('[data-shamir-prep-status]');
  if (status) {
    status.textContent = isReady
      ? 'Shares prepared. You can continue to Finalize.'
      : 'Generate and review Shamir shares to enable Next: Finalize.';
    status.classList.toggle('ok', isReady);
    status.classList.toggle('error', !isReady);
  }
  const button = document.querySelector<HTMLButtonElement>('[data-prepare-shamir]');
  if (button) {
    button.textContent = isReady ? 'Regenerate Shamir Shares' : 'Generate Shamir Shares';
  }
  syncSecurityNextButtonState();
};

const bindSecurityFieldListeners = (scope: ParentNode) => {
  scope.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.encryption.mode = input.value as 'password' | 'shamir';
      const sectionPatched = syncSecuritySectionUI();
      if (!sectionPatched) render();
    });
  });

  scope.querySelector<HTMLInputElement>('[data-password]')?.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    state.encryption.password = value;
    const strengthEl = scope.querySelector<HTMLSpanElement>('[data-strength]');
    if (strengthEl) strengthEl.textContent = String(passwordStrength(value));
    syncSecurityFieldErrorUI();
  });

  scope.querySelector<HTMLInputElement>('[data-password-visibility]')?.addEventListener('change', (event) => {
    state.securityShowPasswords = (event.target as HTMLInputElement).checked;
    syncSecurityPasswordVisibilityUI();
  });

  scope.querySelector<HTMLSelectElement>('[data-argon-preset]')?.addEventListener('change', (event) => {
    state.encryption.argonPresetId = (event.target as HTMLSelectElement).value as 'default' | 'high' | 'custom';
    syncArgonPresetUI();
  });

  scope.querySelector<HTMLInputElement>('[data-argon-time]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.timeCost = Number((event.target as HTMLInputElement).value);
    const helper = scope.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
    syncSecurityFieldErrorUI();
  });

  scope.querySelector<HTMLInputElement>('[data-argon-memory]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.memoryCostMB = Number((event.target as HTMLInputElement).value);
    const helper = scope.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
    syncSecurityFieldErrorUI();
  });

  scope.querySelector<HTMLInputElement>('[data-argon-parallelism]')?.addEventListener('input', (event) => {
    state.encryption.argonCustom.parallelism = Number((event.target as HTMLInputElement).value);
    const helper = scope.querySelector<HTMLParagraphElement>('[data-argon-error]');
    if (helper) {
      const validation = validateArgon2Params(state.encryption.argonCustom);
      helper.textContent = validation.valid ? 'Custom parameters look good.' : validation.error ?? '';
      helper.classList.toggle('error', !validation.valid);
    }
    syncSecurityFieldErrorUI();
  });

  scope.querySelector<HTMLInputElement>('[data-confirm]')?.addEventListener('input', (event) => {
    state.encryption.confirm = (event.target as HTMLInputElement).value;
    syncSecurityFieldErrorUI();
  });

  scope.querySelector<HTMLInputElement>('[data-hint]')?.addEventListener('input', (event) => {
    state.encryption.hint = (event.target as HTMLInputElement).value;
    invalidateShamirPreparation();
    syncShamirPreparationUI();
  });

  scope.querySelector<HTMLInputElement>('[data-threshold]')?.addEventListener('input', (event) => {
    const thresholdInput = event.target as HTMLInputElement;
    state.encryption.threshold = Number(thresholdInput.value);
    if (state.encryption.totalShares < state.encryption.threshold) {
      state.encryption.totalShares = state.encryption.threshold;
    }
    const totalInput = scope.querySelector<HTMLInputElement>('[data-total]');
    if (totalInput) {
      totalInput.min = String(state.encryption.threshold);
      if (Number(totalInput.value) < state.encryption.threshold) {
        totalInput.value = String(state.encryption.threshold);
      }
    }
    invalidateShamirPreparation();
    syncSecurityFieldErrorUI();
    syncShamirPreparationUI();
  });

  scope.querySelector<HTMLInputElement>('[data-total]')?.addEventListener('input', (event) => {
    state.encryption.totalShares = Number((event.target as HTMLInputElement).value);
    invalidateShamirPreparation();
    syncSecurityFieldErrorUI();
    syncShamirPreparationUI();
  });

  scope.querySelector<HTMLButtonElement>('[data-prepare-shamir]')?.addEventListener('click', () => {
    prepareShamirShares();
  });
};

const bindShareDisplayListeners = (scope: ParentNode) => {
  scope.querySelectorAll<HTMLInputElement>('input[name="share-display"]').forEach((input) => {
    input.addEventListener('change', () => {
      const mode = input.value;
      const sharesRoot = input.closest('.shares');
      const shareElements = sharesRoot
        ? sharesRoot.querySelectorAll<HTMLDivElement>('.share')
        : document.querySelectorAll<HTMLDivElement>('.share');
      shareElements.forEach((shareEl) => {
        const textareas = shareEl.querySelectorAll<HTMLTextAreaElement>('textarea');
        if (textareas.length < 2) return;
        textareas[0].classList.toggle('hidden', mode !== 'words');
        textareas[1].classList.toggle('hidden', mode !== 'hex');
      });
    });
  });
};

const bindPathFieldListeners = (scope: ParentNode) => {
  scope.querySelectorAll<HTMLButtonElement>('[data-remove-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [seedId, pathId] = (btn.dataset.removePath ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      if (!seed || !canRemovePath(seed.paths.length)) return;
      invalidateShamirPreparation();
      seed.paths = seed.paths.filter((path) => path.id !== pathId);
      if (seed.paths.length === 0) {
        const defaultPreset = HD_PATH_PRESETS[0];
        const label = buildAutoPathLabel(getSeedDisplayName(seed), defaultPreset.label, 1);
        seed.paths.push(createPath(defaultPreset, label, false));
      }
      render();
    });
  });

  scope.querySelectorAll<HTMLSelectElement>('[data-path-preset]').forEach((select) => {
    select.addEventListener('change', () => {
      const [seedId, pathId] = (select.dataset.pathPreset ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (!path) return;
      invalidateShamirPreparation();
      const preset = HD_PATH_PRESETS.find((p) => p.id === select.value);
      if (preset) {
        path.preset = preset.id;
        path.path = preset.path;
        if (!path.labelCustomized) {
          path.label = buildCurrentAutoPathLabel(seed, path, preset.id);
        }
      } else {
        path.preset = 'custom';
      }
      syncPathPresetUI(seed, path);
      schedulePreview(seed, path);
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-path-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathLabel ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path && seed) {
        invalidateShamirPreparation();
        path.label = input.value;
        const autoLabel = buildCurrentAutoPathLabel(seed, path);
        path.labelCustomized = input.value.trim().length > 0 && input.value !== autoLabel;
      }
      syncPathFieldErrorUI(seedId, pathId);
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-path-value]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathValue ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path && seed) {
        invalidateShamirPreparation();
        path.path = input.value;
        path.preset = 'custom';
        schedulePreview(seed, path);
        syncPathPresetUI(seed, path);
      }
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-path-passphrase]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathPassphrase ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        invalidateShamirPreparation();
        path.passphrase = input.value;
        schedulePreview(seed!, path);
      }
      syncPathFieldErrorUI(seedId, pathId);
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-path-passphrase-label]').forEach((input) => {
    input.addEventListener('input', () => {
      const [seedId, pathId] = (input.dataset.pathPassphraseLabel ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        invalidateShamirPreparation();
        path.passphraseLabel = input.value;
      }
      syncPathFieldErrorUI(seedId, pathId);
    });
  });

  scope.querySelectorAll<HTMLInputElement>('[data-path-count]').forEach((input) => {
    const handleCountChange = () => {
      const [seedId, pathId] = (input.dataset.pathCount ?? '').split(':');
      const seed = state.seeds.find((s) => s.id === seedId);
      const path = seed?.paths.find((p) => p.id === pathId);
      if (path) {
        invalidateShamirPreparation();
        path.deriveCount = Number(input.value);
        schedulePreview(seed!, path);
      }
      syncPathFieldErrorUI(seedId, pathId);
    };
    input.addEventListener('input', handleCountChange);
    input.addEventListener('change', handleCountChange);
  });
};

const syncPathsPreviewWarningUI = () => {
  if (state.currentStep !== 'paths') return false;
  const section = document.querySelector<HTMLElement>('[data-paths-section]');
  const warningHost = section?.querySelector<HTMLElement>('[data-paths-preview-warning-host]');
  if (!warningHost) return false;

  warningHost.replaceChildren();
  if (shouldShowLargePreviewWarning(getTotalPreviewCount(state.seeds))) {
    warningHost.appendChild(buildPathsPreviewWarning());
  }
  return true;
};

const appendPathCard = (seed: SeedForm, path: PathForm) => {
  if (state.currentStep !== 'paths') return false;
  const pathsContainer = document.querySelector<HTMLElement>(`[data-seed-paths-container="${seed.id}"]`);
  if (!pathsContainer) return false;

  const fieldErrors = collectFieldErrors();
  const pathEl = buildPathCard(seed, path, fieldErrors);
  pathsContainer.appendChild(pathEl);
  bindPathFieldListeners(pathEl);
  syncRemovePathButtonsForSeed(seed);
  return true;
};

const buildShamirSharesPanel = (
  shares: Array<{ id: number; words: string; hex: string }>,
  title: string,
  helperText: string
) => {
  const sharesEl = el('div', { className: 'shares' });
  sharesEl.appendChild(el('h3', { text: title }));
  sharesEl.appendChild(
    el('p', {
      className: 'helper',
      text: helperText
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

  shares.forEach((share) => {
    const shareEl = el('div', { className: 'share', dataset: { share: String(share.id) } });
    shareEl.appendChild(el('strong', { text: `Share ${share.id}` }));
    shareEl.appendChild(el('textarea', { readOnly: true, value: share.words }));
    shareEl.appendChild(el('textarea', { className: 'hidden', readOnly: true, value: share.hex }));
    sharesEl.appendChild(shareEl);
  });

  return sharesEl;
};

const prepareShamirShares = () => {
  state.securityValidationArmed = true;
  const errors = [...validateSeedsSection(), ...validateFilesSection(), ...validatePathsSection(), ...validateSecuritySection()];
  if (errors.length) {
    state.stepError = errors[0];
    render();
    return;
  }

  try {
    const data = buildVaultData();
    const fileSummary = buildFileBundleSummary(data);
    const { vault, shares } = encryptWithShamir({
      data,
      threshold: state.encryption.threshold,
      totalShares: state.encryption.totalShares,
      hint: state.encryption.hint.trim() || undefined
    });
    const vaultHtml = buildVaultHtml(vault);
    const cipherMd = buildCiphertextMarkdown(vault, fileSummary);
    state.preparedShamir = {
      fingerprint: buildShamirFingerprint(data),
      vaultHtml,
      cipherMd,
      shares: shares.map((share) => ({
        id: share.id,
        words: formatShareMnemonic(share),
        hex: formatShareHex(share)
      })),
      fileCount: fileSummary.fileCount,
      totalFileBytes: fileSummary.totalFileBytes
    };
    state.stepError = '';
    setStatus('Shamir shares generated. Review them, then continue to Finalize.', 'info');
    syncShamirPreparationUI();
  } catch (error) {
    setStatus((error as Error).message, 'error');
  }
};

const buildSecuritySection = () => {
  const fieldErrors = collectFieldErrors();
  const argonCustomValidation =
    state.encryption.mode === 'password' && state.encryption.argonPresetId === 'custom'
      ? validateArgon2Params(state.encryption.argonCustom)
      : { valid: true };

  const section = el('section', { className: 'card wizard-card', dataset: { securitySection: '' } });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [
        el('h2', { text: 'Step 4: Choose Security Mode' }),
        el('p', { className: 'helper', text: 'Pick password encryption or Shamir shares, then set recovery details.' })
      ])
    ])
  );

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
        className: hasFieldError(fieldErrors, 'password') ? 'field-error' : undefined,
        type: state.securityShowPasswords ? 'text' : 'password',
        dataset: { password: '' },
        value: state.encryption.password
      })
    );
    section.appendChild(el('label', { text: 'Confirm Password' }));
    section.appendChild(
      el('input', {
        className: hasFieldError(fieldErrors, 'confirm') ? 'field-error' : undefined,
        type: state.securityShowPasswords ? 'text' : 'password',
        dataset: { confirm: '' },
        value: state.encryption.confirm
      })
    );
    const visibilityToggle = el('label', { className: 'password-visibility-toggle' });
    visibilityToggle.appendChild(
      el('input', {
        type: 'checkbox',
        checked: state.securityShowPasswords,
        dataset: { passwordVisibility: '' }
      })
    );
    visibilityToggle.appendChild(document.createTextNode(' Show password'));
    section.appendChild(visibilityToggle);
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

    const timeRow = el('div', { className: 'row' }, [
      el('label', { text: 'Time cost (t)' }),
      el('input', {
        className: hasFieldError(fieldErrors, 'argonTime') ? 'field-error' : undefined,
        type: 'number',
        min: String(DEFAULT_ARGON2_MIN.timeCost),
        dataset: { argonTime: '' },
        value: String(state.encryption.argonCustom.timeCost)
      })
    ]);
    const memoryRow = el('div', { className: 'row' }, [
      el('label', { text: 'Memory (MB)' }),
      el('input', {
        className: hasFieldError(fieldErrors, 'argonMemory') ? 'field-error' : undefined,
        type: 'number',
        min: String(DEFAULT_ARGON2_MIN.memoryCostMB),
        dataset: { argonMemory: '' },
        value: String(state.encryption.argonCustom.memoryCostMB)
      })
    ]);
    const parallelRow = el('div', { className: 'row' }, [
      el('label', { text: 'Parallelism (p)' }),
      el('input', {
        className: hasFieldError(fieldErrors, 'argonParallelism') ? 'field-error' : undefined,
        type: 'number',
        min: String(DEFAULT_ARGON2_MIN.parallelism),
        dataset: { argonParallelism: '' },
        value: String(state.encryption.argonCustom.parallelism)
      })
    ]);
    const customFields = el('div', {
      dataset: { argonCustom: '' },
      hidden: state.encryption.argonPresetId !== 'custom'
    });
    customFields.appendChild(timeRow);
    customFields.appendChild(memoryRow);
    customFields.appendChild(parallelRow);
    customFields.appendChild(
      el('p', {
        className: `helper ${argonCustomValidation.valid ? '' : 'error'}`,
        dataset: { argonError: '' },
        text: argonCustomValidation.valid ? 'Custom parameters look good.' : argonCustomValidation.error ?? ''
      })
    );
    section.appendChild(customFields);
    section.appendChild(
      el('p', {
        className: 'helper',
        dataset: { argonPresetHint: '' },
        hidden: state.encryption.argonPresetId === 'custom',
        text: 'Higher settings increase security but may take up to 85 seconds on mobile.'
      })
    );
  } else {
    const shamirReady = hasPreparedShamirForCurrentState();
    const thresholdRow = el('div', { className: 'row' }, [
      el('label', { text: 'Threshold (k)' }),
      el('input', {
        className: hasFieldError(fieldErrors, 'threshold') ? 'field-error' : undefined,
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
        className: hasFieldError(fieldErrors, 'total') ? 'field-error' : undefined,
        type: 'number',
        min: String(state.encryption.threshold),
        max: '10',
        dataset: { total: '' },
        value: String(state.encryption.totalShares)
      })
    ]);
    section.appendChild(thresholdRow);
    section.appendChild(totalRow);
    const shamirActions = el('div', { className: 'security-shamir__actions' });
    shamirActions.appendChild(
      el('button', {
        className: 'primary security-shamir__prepare',
        dataset: { prepareShamir: '' },
        text: shamirReady ? 'Regenerate Shamir Shares' : 'Generate Shamir Shares'
      })
    );
    section.appendChild(shamirActions);
    section.appendChild(
      el('p', {
        className: `helper security-shamir__status ${shamirReady ? 'ok' : 'error'}`,
        dataset: { shamirPrepStatus: '' },
        text: shamirReady
          ? 'Shares prepared. You can continue to Finalize.'
          : 'Generate and review Shamir shares to enable Next: Finalize.'
      })
    );
    if (shamirReady && state.preparedShamir) {
      section.appendChild(
        buildShamirSharesPanel(
          state.preparedShamir.shares,
          'Review Shamir Shares',
          `Store these securely. You need ${state.encryption.threshold} shares to decrypt.`
        )
      );
    }
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

const buildFinalizeSection = () => {
  const section = el('section', { className: 'card wizard-card' });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [
        el('h2', { text: 'Step 5: Finalize Vault' }),
        el('p', { className: 'helper', text: 'Generate vault artifacts, then explicitly download HTML and ciphertext instructions.' })
      ])
    ])
  );

  const summary = el('div', { className: 'summary-grid' });
  summary.appendChild(el('div', { className: 'summary-chip', text: `${state.seeds.length} seed${state.seeds.length === 1 ? '' : 's'}` }));
  const totalFiles = state.generated ? state.generated.fileCount : getEffectiveFiles().length;
  const totalFileBytes = state.generated
    ? state.generated.totalFileBytes
    : getEffectiveFiles().reduce((sum, file) => sum + file.size, 0);
  summary.appendChild(
    el('div', {
      className: 'summary-chip',
      text: `${totalFiles} file${totalFiles === 1 ? '' : 's'} (${formatBytes(totalFileBytes)})`
    })
  );
  const totalPaths = state.seeds.reduce((sum, seed) => sum + seed.paths.length, 0);
  summary.appendChild(el('div', { className: 'summary-chip', text: `${totalPaths} path${totalPaths === 1 ? '' : 's'}` }));
  summary.appendChild(el('div', { className: 'summary-chip', text: `Mode: ${state.encryption.mode === 'password' ? 'Password' : 'Shamir'}` }));
  section.appendChild(summary);

  if (state.status !== DEFAULT_STATUS_MESSAGE) {
    section.appendChild(
      el('div', { className: `status ${state.statusTone}`, dataset: { finalizeStatus: '' }, text: state.status })
    );
  }

  section.appendChild(
    el('button', {
      className: 'primary',
      dataset: { generate: '' },
      disabled: state.isGenerating || isPostGenerateLocked(),
      text: state.isGenerating ? 'Generating...' : isPostGenerateLocked() ? 'Vault Generated' : 'Generate Vault'
    })
  );

  const downloadActions = el('div', { className: 'finalize-downloads' }, [
    el('button', {
      className: 'primary',
      dataset: { downloadVaultHtml: '' },
      disabled: !state.generated || state.isGenerating,
      text: 'Download Seed Vault HTML'
    }),
    el('button', {
      className: 'ghost',
      dataset: { downloadCipherMd: '' },
      disabled: !state.generated || state.isGenerating,
      text: 'Download Ciphertext Instructions (.md)'
    })
  ]);
  section.appendChild(downloadActions);

  const progress = el('div', { className: 'progress', hidden: !state.isGenerating });
  const bar = el('div', { className: 'bar', attrs: { style: `width: ${Math.round(state.progress * 100)}%` } });
  progress.appendChild(bar);
  section.appendChild(progress);

  if (state.generated && state.generated.shares.length) {
    section.appendChild(
      buildShamirSharesPanel(
        state.generated.shares,
        'Shamir Shares',
        `Record these shares securely. You need ${state.encryption.threshold} shares to decrypt.`
      )
    );
  }

  return section;
};

const buildWizardNavigation = () => {
  const wrapper = el('div', { className: 'wizard-controls-wrap' });
  if (state.stepError) {
    wrapper.appendChild(el('div', { className: 'status error step-error', dataset: { stepError: '' }, text: state.stepError }));
  }

  const controls = el('div', { className: 'wizard-controls' });
  const currentIndex = getStepIndex(state.currentStep);
  const previousLabel = currentIndex > 0 ? WIZARD_STEPS[currentIndex - 1].title : '';
  const nextLabel = currentIndex < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[currentIndex + 1].title : '';

  controls.appendChild(
    el('button', {
      className: 'ghost',
      dataset: { stepPrev: '' },
      disabled: currentIndex === 0 || state.isGenerating || isPostGenerateLocked(),
      text: currentIndex === 0 ? 'Back' : `Back: ${previousLabel}`
    })
  );

  if (state.currentStep !== 'finalize') {
    const nextDisabled = state.isGenerating || isShamirFinalizeBlocked();
    controls.appendChild(
      el('button', {
        className: 'primary',
        dataset: { stepNext: '' },
        disabled: nextDisabled,
        text: `Next: ${nextLabel}`
      })
    );
  }

  wrapper.appendChild(controls);
  return wrapper;
};

const buildCurrentStepPanel = () => {
  if (state.currentStep === 'seeds') return buildSeedsSection();
  if (state.currentStep === 'files') return buildFilesSection();
  if (state.currentStep === 'paths') return buildPathsSection();
  if (state.currentStep === 'security') return buildSecuritySection();
  return buildFinalizeSection();
};

const buildFaqPage = () => {
  const selectedCategory = getSelectedFaqCategory();
  const section = el('section', { className: 'card faq-page', dataset: { faqPage: '' } });
  section.appendChild(
    el('div', { className: 'card__header' }, [
      el('div', {}, [
        el('h2', { text: 'Creator FAQ' }),
        el('p', {
          className: 'helper',
          text: `Comprehensive reference for creator setup, encryption decisions, and vault recovery (${FAQ_ENTRY_COUNT} questions).`
        })
      ])
    ])
  );

  const categoryHost = el('div', { className: 'faq-categories', attrs: { role: 'tablist', 'aria-label': 'FAQ categories' } });
  FAQ_CATEGORIES.forEach((category) => {
    const isActive = category.id === selectedCategory?.id;
    const button = el('button', {
      className: `faq-category ${isActive ? 'is-active' : ''}`,
      dataset: { faqCategory: category.id },
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(isActive) }
    });
    button.appendChild(el('strong', { text: category.title }));
    button.appendChild(el('span', { text: `${category.entries.length} questions` }));
    categoryHost.appendChild(button);
  });
  section.appendChild(categoryHost);

  if (!selectedCategory) {
    section.appendChild(
      el('p', {
        className: 'helper error',
        text: 'FAQ content is currently unavailable.'
      })
    );
    return section;
  }

  section.appendChild(el('p', { className: 'helper', text: selectedCategory.description }));
  const list = el('div', { className: 'faq-list' });
  selectedCategory.entries.forEach((entry) => {
    const expanded = state.faqExpandedEntries.has(entry.id);
    const answerId = `faq-answer-${entry.id}`;
    const item = el('article', { className: `faq-item ${expanded ? 'is-open' : ''}` });
    item.appendChild(
      el(
        'button',
        {
          className: 'faq-item__question',
          dataset: { faqEntryToggle: entry.id },
          attrs: {
            type: 'button',
            'aria-expanded': String(expanded),
            'aria-controls': answerId
          }
        },
        [
          el('span', { text: entry.question }),
          el('span', { className: 'faq-item__icon', text: expanded ? '-' : '+' })
        ]
      )
    );
    item.appendChild(
      el(
        'div',
        {
          className: 'faq-item__answer',
          dataset: { faqEntryAnswer: entry.id },
          attrs: { id: answerId },
          hidden: !expanded
        },
        [el('p', { text: entry.answer })]
      )
    );
    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
};

const syncFaqEntryUI = (entryId: string) => {
  const toggle = document.querySelector<HTMLButtonElement>(`[data-faq-entry-toggle="${entryId}"]`);
  const answer = document.querySelector<HTMLElement>(`[data-faq-entry-answer="${entryId}"]`);
  if (!toggle || !answer) return;

  const expanded = state.faqExpandedEntries.has(entryId);
  toggle.setAttribute('aria-expanded', String(expanded));
  const icon = toggle.querySelector<HTMLElement>('.faq-item__icon');
  if (icon) icon.textContent = expanded ? '-' : '+';
  answer.hidden = !expanded;
  toggle.closest('.faq-item')?.classList.toggle('is-open', expanded);
};

const buildCreatorHeader = () => {
  const header = el('header', { className: 'creator__header' });
  const topRow = el('div', { className: 'creator__header-top' });
  topRow.appendChild(
    el('div', {}, [
      el('h1', { text: 'Seed Vault Creator' }),
      el('p', { text: 'Offline tool to encrypt seed phrases, sensitive files, and recovery details into a portable vault.' })
    ])
  );

  const actions = el('div', { className: 'creator__header-actions' });
  actions.appendChild(
    el('button', {
      className: state.view === 'wizard' ? 'primary' : 'ghost',
      dataset: { viewSwitch: 'wizard' },
      attrs: { type: 'button' },
      text: 'Vault Creator'
    })
  );
  actions.appendChild(
    el('button', {
      className: state.view === 'faq' ? 'primary' : 'ghost',
      dataset: { viewSwitch: 'faq' },
      attrs: { type: 'button' },
      text: 'FAQ'
    })
  );
  topRow.appendChild(actions);
  header.appendChild(topRow);
  return header;
};

const buildCreatorFooter = () =>
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? null
    : el('footer', { className: 'creator__footer' }, [
        el('a', {
          className: 'creator__footer-link',
          dataset: { downloadOfflineCreator: '' },
          attrs: {
            href: GITHUB_RELEASES_STANDALONE_URL,
            target: '_blank',
            rel: 'noreferrer noopener'
          },
          text: 'Download for offline usage'
        })
      ]);

const buildApp = () => {
  const main = el('main', { className: 'creator wizard' });
  main.appendChild(buildCreatorHeader());

  if (state.view === 'faq') {
    main.appendChild(buildFaqPage());
    return main;
  }

  main.appendChild(buildWizardStepper());
  if (!(state.currentStep === 'finalize' && state.status === DEFAULT_STATUS_MESSAGE)) {
    main.appendChild(
      el('div', { className: `status status--banner ${state.statusTone}`, dataset: { statusBanner: '' }, text: state.status })
    );
  }
  main.appendChild(buildCurrentStepPanel());
  main.appendChild(buildWizardNavigation());
  const creatorFooter = buildCreatorFooter();
  if (creatorFooter) {
    main.appendChild(creatorFooter);
  }
  return main;
};

const render = () => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  root.replaceChildren(buildApp());

  root.querySelectorAll<HTMLButtonElement>('[data-view-switch]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetView = button.dataset.viewSwitch;
      if (targetView === 'wizard' || targetView === 'faq') {
        setCreatorView(targetView);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-faq-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const categoryId = button.dataset.faqCategory;
      if (!categoryId || categoryId === state.faqSelectedCategory) return;
      state.faqSelectedCategory = categoryId;
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-faq-entry-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const entryId = button.dataset.faqEntryToggle;
      if (!entryId) return;
      if (state.faqExpandedEntries.has(entryId)) {
        state.faqExpandedEntries.delete(entryId);
      } else {
        state.faqExpandedEntries.add(entryId);
      }
      syncFaqEntryUI(entryId);
    });
  });

  root.querySelector<HTMLButtonElement>('[data-step-next]')?.addEventListener('click', () => {
    goToNextStep();
  });

  root.querySelector<HTMLButtonElement>('[data-step-prev]')?.addEventListener('click', () => {
    goToPreviousStep();
  });

  root.querySelector<HTMLButtonElement>('[data-add-seed]')?.addEventListener('click', () => {
    const seed = createSeed(state.seeds.length);
    state.seeds.push(seed);
    invalidateShamirPreparation();
    const appended = appendSeedCard(seed);
    if (!appended) {
      render();
      return;
    }
    syncAllSeedFieldErrorUI();
  });
  bindSeedFieldListeners(root);
  bindFilesFieldListeners(root);

  root.querySelectorAll<HTMLButtonElement>('[data-add-path-seed]').forEach((button) => {
    button.addEventListener('click', () => {
      const seedId = button.dataset.addPathSeed;
      if (!seedId) return;
      addPathToSeed(seedId);
    });
  });

  bindPathFieldListeners(root);

  bindSecurityFieldListeners(root);

  root.querySelector<HTMLButtonElement>('[data-generate]')?.addEventListener('click', handleGenerate);
  root.querySelector<HTMLButtonElement>('[data-download-vault-html]')?.addEventListener('click', handleDownloadVaultHtml);
  root.querySelector<HTMLButtonElement>('[data-download-cipher-md]')?.addEventListener('click', handleDownloadCipherMd);

  bindShareDisplayListeners(root);
};

export const renderCreatorApp = () => {
  bindCreatorHashListener();
  if (typeof window !== 'undefined') {
    state.view = getViewFromHash(window.location.hash);
  }
  syncCreatorHash(state.view);
  render();
};
