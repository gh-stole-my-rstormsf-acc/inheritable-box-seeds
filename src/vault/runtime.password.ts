import { decryptWithPasswordRuntime } from '../shared/crypto/vault-password-runtime';
import { deriveKeyArgon2Wasm } from './argon2Wasm';
import { startVaultRuntime } from './runtime.app';

startVaultRuntime({
  decryptPassword: ({ password, vault, onProgress }) =>
    decryptWithPasswordRuntime({
      password,
      vault,
      kdf: deriveKeyArgon2Wasm,
      onProgress
    })
});
