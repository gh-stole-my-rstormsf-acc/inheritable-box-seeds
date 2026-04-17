const VAULT_ATTACHMENT_PROCESSING_MULTIPLIER = 12;
const VAULT_ATTACHMENT_PROCESSING_OVERHEAD_BYTES = 8 * 1024 * 1024;
const USER_VISIBLE_VAULT_TOTAL_FILE_BYTES = 10 * 1024 * 1024;

export const MAX_VAULT_FILE_COUNT = 12;
export const MAX_VAULT_ATTACHMENT_PROCESSING_BYTES = 160 * 1024 * 1024;
export const MAX_VAULT_TOTAL_FILE_LABEL = '10 MB';
export const MAX_VAULT_TOTAL_FILE_BYTES = Math.min(
  USER_VISIBLE_VAULT_TOTAL_FILE_BYTES,
  Math.floor(
    (MAX_VAULT_ATTACHMENT_PROCESSING_BYTES - VAULT_ATTACHMENT_PROCESSING_OVERHEAD_BYTES) /
      VAULT_ATTACHMENT_PROCESSING_MULTIPLIER
  )
);

export const estimateVaultAttachmentProcessingBytes = (totalFileBytes: number) => {
  if (totalFileBytes <= 0) {
    return 0;
  }
  return totalFileBytes * VAULT_ATTACHMENT_PROCESSING_MULTIPLIER + VAULT_ATTACHMENT_PROCESSING_OVERHEAD_BYTES;
};

export const isVaultAttachmentSizeSupported = (totalFileBytes: number) =>
  totalFileBytes <= MAX_VAULT_TOTAL_FILE_BYTES &&
  estimateVaultAttachmentProcessingBytes(totalFileBytes) <= MAX_VAULT_ATTACHMENT_PROCESSING_BYTES;
