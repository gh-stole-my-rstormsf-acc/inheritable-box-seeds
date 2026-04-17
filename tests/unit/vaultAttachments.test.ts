import { describe, expect, it } from 'vitest';
import {
  MAX_VAULT_ATTACHMENT_PROCESSING_BYTES,
  MAX_VAULT_TOTAL_FILE_BYTES,
  estimateVaultAttachmentProcessingBytes,
  isVaultAttachmentSizeSupported
} from '../../src/shared/vaultAttachments';

describe('vault attachment sizing', () => {
  it('keeps the supported attachment budget below the old optimistic raw limit', () => {
    expect(MAX_VAULT_TOTAL_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_VAULT_TOTAL_FILE_BYTES).toBeLessThan(25 * 1024 * 1024);
    expect(MAX_VAULT_TOTAL_FILE_BYTES).toBeGreaterThan(0);
  });

  it('estimates a conservative processing footprint for embedded attachments', () => {
    expect(estimateVaultAttachmentProcessingBytes(0)).toBe(0);
    expect(estimateVaultAttachmentProcessingBytes(8 * 1024 * 1024)).toBeGreaterThan(8 * 1024 * 1024);
    expect(estimateVaultAttachmentProcessingBytes(MAX_VAULT_TOTAL_FILE_BYTES)).toBeLessThanOrEqual(
      MAX_VAULT_ATTACHMENT_PROCESSING_BYTES
    );
  });

  it('rejects attachments that would exceed the processing budget', () => {
    expect(isVaultAttachmentSizeSupported(MAX_VAULT_TOTAL_FILE_BYTES)).toBe(true);
    expect(isVaultAttachmentSizeSupported(MAX_VAULT_TOTAL_FILE_BYTES + 1)).toBe(false);
  });
});
