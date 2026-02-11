import type { Vault } from '../shared/types';

interface CipherMarkdownContext {
  fileCount?: number;
  totalFileBytes?: number;
}

const PASSWORD_LIBS = [
  'argon2-browser@^1.18.0',
  '@noble/post-quantum@^0.2.0',
  '@noble/curves@^1.4.0',
  '@noble/ciphers@^0.5.0'
] as const;

const SHAMIR_LIBS = [
  '@scure/bip39@^1.3.0',
  '@noble/post-quantum@^0.2.0',
  '@noble/curves@^1.4.0',
  '@noble/ciphers@^0.5.0'
] as const;

const quoteBlock = (value: string) => `\`\`\`text\n${value}\n\`\`\``;

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const buildMetadataLines = (vault: Vault) => {
  const common = [
    `- Vault version: ${vault.version}`,
    `- Created: ${vault.created}`,
    `- Hint: ${vault.hint?.trim() ? vault.hint.trim() : '[none]'}`,
    `- Encryption mode: ${vault.encryption.type}`,
    `- Algorithm: ${vault.encryption.algorithm}`,
    `- Nonce (base64): ${vault.encryption.nonce}`,
    `- Encapsulated key (base64): ${vault.encryption.mlkem.encapsulatedKey}`
  ];

  if (vault.encryption.type === 'password') {
    return [
      ...common,
      `- Argon2 salt (base64): ${vault.encryption.argon2.salt}`,
      `- Argon2 time cost: ${vault.encryption.argon2.timeCost}`,
      `- Argon2 memory cost (MB): ${vault.encryption.argon2.memoryCost}`,
      `- Argon2 parallelism: ${vault.encryption.argon2.parallelism}`
    ];
  }

  return [
    ...common,
    `- Shamir threshold (k): ${vault.encryption.threshold}`,
    `- Shamir total shares (n): ${vault.encryption.totalShares}`,
    `- Share identifiers: ${vault.encryption.shareIdentifiers.join(', ')}`
  ];
};

const buildDecryptNotes = (vault: Vault) => {
  if (vault.encryption.type === 'password') {
    return [
      '1. Derive a 32-byte key from the password with Argon2id using the parameters above.',
      '2. Build receiver keys from the derived key, then decapsulate the ML-KEM payload.',
      '3. Combine secrets as in the vault runtime and decrypt with AES-256-GCM using the nonce and AAD metadata.',
      '4. Parse decrypted JSON into vault data (seeds + paths).'
    ];
  }

  return [
    '1. Parse at least k shares (words or hex) and combine via Shamir to recover the 32-byte master seed.',
    '2. Build receiver keys from the recovered seed, then decapsulate the ML-KEM payload.',
    '3. Decrypt ciphertext with AES-256-GCM using the nonce and AAD metadata.',
    '4. Parse decrypted JSON into vault data (seeds + paths).'
  ];
};

export const buildCiphertextMarkdown = (vault: Vault, context: CipherMarkdownContext = {}) => {
  const libraries = vault.encryption.type === 'password' ? PASSWORD_LIBS : SHAMIR_LIBS;
  const metadataLines = buildMetadataLines(vault).join('\n');
  const decryptNotes = buildDecryptNotes(vault).map((line) => `- ${line}`).join('\n');
  const fileCount = context.fileCount ?? 0;
  const totalFileBytes = context.totalFileBytes ?? 0;

  return [
    '# Seed Vault Ciphertext Package',
    '',
    'This markdown contains ciphertext material and decryption metadata only.',
    'Do not store mnemonics, shares, or passwords in this file.',
    '',
    '## Ciphertext (base64)',
    quoteBlock(vault.payload),
    '',
    '## Vault Metadata',
    metadataLines,
    '',
    '## Encrypted File Bundle',
    `- Attached files: ${fileCount}`,
    `- Total attached size: ${formatBytes(totalFileBytes)}`,
    '',
    '## Public Libraries (Pinned Versions)',
    ...libraries.map((library) => `- ${library}`),
    '',
    'Install command:',
    '```bash',
    `npm install ${libraries.join(' ')}`,
    '```',
    '',
    '## Decryption Outline',
    decryptNotes,
    '',
    '## Integrity Note',
    '- If any metadata field differs, decryption/AAD validation will fail.',
    '- Keep this file together with your vault mode inputs (password or required shares).'
  ].join('\n');
};
