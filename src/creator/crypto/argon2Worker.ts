import type { Argon2Params, Argon2Result } from '../../shared/crypto/argon2';
import { shouldUseModuleWorker } from '../../shared/browserWorker';

export const deriveKeyArgon2Worker = (
  password: string,
  params: Argon2Params,
  onProgress?: (progress: number) => void
): Promise<Argon2Result> => {
  const worker = shouldUseModuleWorker()
    ? new Worker(new URL('./argon2.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./argon2.worker.ts', import.meta.url));

  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      const { type, value, key, salt, message } = event.data as {
        type: 'progress' | 'result' | 'error';
        value?: number;
        key?: ArrayBuffer;
        salt?: ArrayBuffer;
        message?: string;
      };

      if (type === 'progress' && typeof value === 'number') {
        onProgress?.(value);
        return;
      }

      if (type === 'result' && key && salt) {
        worker.terminate();
        resolve({ key: new Uint8Array(key), salt: new Uint8Array(salt), params });
        return;
      }

      if (type === 'error') {
        worker.terminate();
        reject(new Error(message ?? 'Argon2 worker failed.'));
      }
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Argon2 worker failed.'));
    };

    worker.postMessage({ password, params });
  });
};
