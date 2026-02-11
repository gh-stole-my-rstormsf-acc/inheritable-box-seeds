import { describe, expect, it } from 'vitest';
import { buildCiphertextMarkdown } from '../../src/creator/cipherMarkdown';
import type { Vault } from '../../src/shared/types';

describe('cipher markdown export', () => {
  it('renders password-mode instructions with pinned library versions', () => {
    const vault: Vault = {
      version: 2,
      created: '2026-02-11T00:00:00.000Z',
      hint: 'demo',
      encryption: {
        type: 'password',
        algorithm: 'argon2id-mlkem768-aes256gcm',
        argon2: {
          salt: 'salt-base64',
          timeCost: 4,
          memoryCost: 512,
          parallelism: 4
        },
        mlkem: {
          encapsulatedKey: 'enc-key-base64'
        },
        nonce: 'nonce-base64'
      },
      payload: 'cipher-base64'
    };

    const markdown = buildCiphertextMarkdown(vault, { fileCount: 2, totalFileBytes: 2048 });

    expect(markdown).toContain('cipher-base64');
    expect(markdown).toContain('argon2-browser@^1.18.0');
    expect(markdown).toContain('@noble/post-quantum@^0.2.0');
    expect(markdown).toContain('- Argon2 time cost: 4');
    expect(markdown).toContain('npm install argon2-browser@^1.18.0');
    expect(markdown).toContain('- Attached files: 2');
    expect(markdown).toContain('- Total attached size: 2.0 KB');
    expect(markdown).not.toContain('@scure/bip39@^1.3.0');
  });

  it('renders shamir-mode instructions with share metadata and no argon2 dependency', () => {
    const vault: Vault = {
      version: 2,
      created: '2026-02-11T00:00:00.000Z',
      encryption: {
        type: 'shamir',
        algorithm: 'shamir-mlkem768-aes256gcm',
        threshold: 2,
        totalShares: 3,
        shareIdentifiers: ['share-1', 'share-2', 'share-3'],
        mlkem: {
          encapsulatedKey: 'enc-key-base64'
        },
        nonce: 'nonce-base64'
      },
      payload: 'cipher-base64'
    };

    const markdown = buildCiphertextMarkdown(vault, { fileCount: 1, totalFileBytes: 123 });

    expect(markdown).toContain('cipher-base64');
    expect(markdown).toContain('@scure/bip39@^1.3.0');
    expect(markdown).toContain('- Shamir threshold (k): 2');
    expect(markdown).toContain('- Share identifiers: share-1, share-2, share-3');
    expect(markdown).toContain('- Attached files: 1');
    expect(markdown).toContain('- Total attached size: 123 B');
    expect(markdown).not.toContain('argon2-browser@^1.18.0');
  });
});
