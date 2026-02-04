import { deriveEvmAddresses } from '../../shared/derivation/evm';

self.onmessage = (event) => {
  const { requestId, seedId, pathId, mnemonic, passphrase, path, count } = event.data as {
    requestId: number;
    seedId: string;
    pathId: string;
    mnemonic: string;
    passphrase: string;
    path: string;
    count: number;
  };

  try {
    const derived = deriveEvmAddresses(mnemonic, passphrase, path, count);
    self.postMessage({
      requestId,
      seedId,
      pathId,
      addresses: derived.map((item) => item.address)
    });
  } catch (error) {
    self.postMessage({ requestId, seedId, pathId, error: (error as Error).message });
  }
};
