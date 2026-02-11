import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entrySource = String.raw`
import assert from 'node:assert/strict';
import { encryptWithPassword, decryptWithPassword, encryptWithShamir, decryptWithShamir } from './src/shared/crypto/vault';

const sampleData = {
  seeds: [
    {
      label: 'Primary',
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      paths: [
        {
          label: 'BIP-44',
          path: "m/44'/60'/0'/0/0",
          passphrase: 'safety-check',
          passphraseLabel: 'Test passphrase',
          deriveCount: 2
        }
      ]
    }
  ]
};

const fastArgon = { timeCost: 2, memoryCostMB: 1, parallelism: 1 };

const shortCipher = (ciphertext) => ciphertext.slice(0, 24) + '...' + ciphertext.slice(-8);

const runPasswordRoundtrip = async () => {
  const password = 'roundtrip-password';
  const vault = await encryptWithPassword({
    password,
    data: sampleData,
    hint: 'roundtrip-check',
    params: fastArgon
  });
  const decrypted = await decryptWithPassword({ password, vault });
  assert.deepStrictEqual(decrypted, sampleData);
  console.log('[password] decrypt ok | ciphertext chars=' + vault.payload.length + ' | preview=' + shortCipher(vault.payload));
};

const runShamirRoundtrip = () => {
  const { vault, shares } = encryptWithShamir({
    data: sampleData,
    threshold: 2,
    totalShares: 3,
    hint: 'roundtrip-check'
  });
  const usedShares = shares.slice(0, 2);
  const decrypted = decryptWithShamir({ shares: usedShares, vault });
  assert.deepStrictEqual(decrypted, sampleData);
  console.log(
    '[shamir] decrypt ok | ciphertext chars=' +
      vault.payload.length +
      ' | k/n=' +
      vault.encryption.threshold +
      '/' +
      vault.encryption.totalShares +
      ' | shares=' +
      usedShares.map((share) => share.id).join(',')
  );
};

export const run = async () => {
  console.log('Seed Vault cipher roundtrip proof');
  await runPasswordRoundtrip();
  runShamirRoundtrip();
  console.log('All roundtrip checks passed.');
};
`;

let tempDir;

try {
  tempDir = await mkdtemp(join(tmpdir(), 'seed-vault-roundtrip-'));
  const outfile = join(tempDir, 'runner.mjs');

  await build({
    stdin: {
      contents: entrySource,
      sourcefile: 'verify-cipher-roundtrip.entry.ts',
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node25'],
    outfile,
    sourcemap: false,
    logLevel: 'silent'
  });

  const runner = await import(pathToFileURL(outfile).href);
  await runner.run();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('Cipher roundtrip proof failed.');
  console.error(message);
  process.exit(1);
} finally {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
}
