import { describe, expect, it } from 'vitest';
import { deriveEvmAddresses } from '../../src/shared/derivation/evm';
import { buildAddressCsv } from '../../src/shared/derivation/csv';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('EVM derivation', () => {
  it('derives BIP-44 address', () => {
    const [first] = deriveEvmAddresses(mnemonic, '', "m/44'/60'/0'/0/x", 1);
    expect(first.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('derives Ledger Legacy address', () => {
    const [first] = deriveEvmAddresses(mnemonic, '', "m/44'/60'/0'/x", 1);
    expect(first.address).toBe('0xB8Fd42000d00202DCbCF5e18d6640d656345FD6A');
  });

  it('derives Ledger Live address', () => {
    const [first] = deriveEvmAddresses(mnemonic, '', "m/44'/60'/x'/0/0", 1);
    expect(first.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('passphrase changes address', () => {
    const [noPass] = deriveEvmAddresses(mnemonic, '', "m/44'/60'/0'/0/x", 1);
    const [withPass] = deriveEvmAddresses(mnemonic, 'secret', "m/44'/60'/0'/0/x", 1);
    expect(noPass.address).not.toBe(withPass.address);
  });
});

describe('CSV export', () => {
  it('builds CSV with correct headers', () => {
    const csv = buildAddressCsv([
      {
        seedLabel: 'Primary',
        path: "m/44'/60'/0'/0/0",
        passphraseLabel: '',
        index: 0,
        address: '0x123'
      }
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('seed_label,hd_path,passphrase_label,address_index,address');
    expect(lines[1]).toBe("Primary,m/44'/60'/0'/0/0,,0,0x123");
  });
});
