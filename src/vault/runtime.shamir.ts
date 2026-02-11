import { parseShareHex, parseShareMnemonic } from '../shared/crypto/shamir';
import { decryptWithShamirRuntime } from '../shared/crypto/vault-shamir-runtime';
import { startVaultRuntime } from './runtime.app';
import type { ShamirShare } from '../shared/crypto/shamir';

startVaultRuntime({
  parseShamirShares: ({ shareValues, format }) =>
    shareValues.map((value) => (format === 'hex' ? parseShareHex(value) : parseShareMnemonic(value))),
  decryptShamir: ({ shares, vault }) => decryptWithShamirRuntime({ shares: shares as ShamirShare[], vault })
});
