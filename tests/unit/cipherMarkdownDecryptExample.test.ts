import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { encryptWithPassword, encryptWithShamir } from '../../src/shared/crypto/vault';
import { formatShareHex, formatShareMnemonic } from '../../src/shared/crypto/shamir';
import { buildCiphertextMarkdown } from '../../src/creator/cipherMarkdown';
import type { VaultData } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

const sampleData: VaultData = {
  seeds: [
    {
      label: 'Primary',
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      paths: [
        {
          label: 'BIP44',
          path: "m/44'/60'/0'/0/x",
          passphrase: 'test-passphrase',
          passphraseLabel: 'Main',
          deriveCount: 2
        }
      ]
    }
  ],
  files: [
    {
      label: 'Recovery JSON',
      fileName: 'recovery.json',
      mimeType: 'application/json',
      size: 15,
      openHint: 'Open in a trusted editor',
      dataBase64: Buffer.from('{"hello":true}').toString('base64')
    }
  ]
};

const password = 'Example-Password-123!';

type ExampleModule = {
  parseCipherMarkdown: (markdown: string) => { vault: unknown };
  decryptFromCipherMarkdown: (input: {
    markdown: string;
    mode: 'password' | 'shamir';
    password?: string;
    shares?: string[];
    shareFormat?: 'words' | 'hex';
  }) => Promise<VaultData>;
};

describe('decrypt-cipher-md example script', () => {
  let example: ExampleModule;
  let passwordMarkdown = '';
  let shamirMarkdown = '';
  let shamirWordShares: string[] = [];
  let shamirHexShares: string[] = [];

  beforeAll(async () => {
    example = (await import('../../examples/decrypt-cipher-md.mjs')) as ExampleModule;

    const passwordVault = await encryptWithPassword({
      password,
      data: sampleData,
      hint: 'demo hint',
      params: {
        timeCost: 2,
        memoryCostMB: 1,
        parallelism: 1
      }
    });
    passwordMarkdown = buildCiphertextMarkdown(passwordVault, {
      fileCount: sampleData.files?.length ?? 0,
      totalFileBytes: sampleData.files?.reduce((sum, file) => sum + file.size, 0) ?? 0
    });

    const { vault: shamirVault, shares } = await encryptWithShamir({
      data: sampleData,
      threshold: 2,
      totalShares: 3,
      hint: 'shamir hint'
    });
    shamirMarkdown = buildCiphertextMarkdown(shamirVault, {
      fileCount: sampleData.files?.length ?? 0,
      totalFileBytes: sampleData.files?.reduce((sum, file) => sum + file.size, 0) ?? 0
    });

    const selectedShares = shares.slice(0, 2);
    shamirWordShares = selectedShares.map((share) => formatShareMnemonic(share));
    shamirHexShares = selectedShares.map((share) => formatShareHex(share));
  });

  it('parses password markdown metadata into a vault object', () => {
    const parsed = example.parseCipherMarkdown(passwordMarkdown);
    const vault = parsed.vault as {
      encryption: { type: string; argon2?: { timeCost: number } };
      payload: string;
    };

    expect(vault.encryption.type).toBe('password');
    expect(vault.encryption.argon2?.timeCost).toBe(2);
    expect(vault.payload.length).toBeGreaterThan(20);
  });

  it('throws when ciphertext block is missing', () => {
    const broken = passwordMarkdown.replace('## Ciphertext (base64)', '## Cipher Block');
    expect(() => example.parseCipherMarkdown(broken)).toThrow(/ciphertext/i);
  });

  it('throws when required metadata field is missing', () => {
    const broken = passwordMarkdown.replace(/- Argon2 salt \(base64\):.*\n/, '');
    expect(() => example.parseCipherMarkdown(broken)).toThrow(/Argon2 salt/i);
  });

  it('decrypts password mode from markdown + password', async () => {
    const decrypted = await example.decryptFromCipherMarkdown({
      markdown: passwordMarkdown,
      mode: 'password',
      password
    });

    expect(decrypted).toEqual(sampleData);
  });

  it('decrypts shamir mode from markdown + word shares', async () => {
    const decrypted = await example.decryptFromCipherMarkdown({
      markdown: shamirMarkdown,
      mode: 'shamir',
      shares: shamirWordShares,
      shareFormat: 'words'
    });

    expect(decrypted).toEqual(sampleData);
  });

  it('decrypts shamir mode from markdown + hex shares', async () => {
    const decrypted = await example.decryptFromCipherMarkdown({
      markdown: shamirMarkdown,
      mode: 'shamir',
      shares: shamirHexShares,
      shareFormat: 'hex'
    });

    expect(decrypted).toEqual(sampleData);
  });

  it('runs the CLI and writes decrypted output', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cipher-md-cli-'));
    try {
      const mdPath = join(tmp, 'cipher.md');
      const outPath = join(tmp, 'decrypted.json');
      await writeFile(mdPath, passwordMarkdown, 'utf8');

      await execFileAsync(
        'node',
        ['examples/decrypt-cipher-md.mjs', '--md', mdPath, '--mode', 'password', '--password', password, '--out', outPath],
        { cwd: process.cwd() }
      );

      const output = await readFile(outPath, 'utf8');
      expect(JSON.parse(output)).toEqual(sampleData);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
