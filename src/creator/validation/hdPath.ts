export interface HdPathSegment {
  index: number;
  hardened: boolean;
}

export interface HdPathValidationResult {
  valid: boolean;
  error?: string;
  segments?: HdPathSegment[];
}

const MAX_BIP32_INDEX = 0x7fffffff; // 2^31 - 1

const normalizePath = (input: string) => input.trim();

const parseSegment = (segment: string): HdPathSegment | null => {
  if (!segment) return null;
  const hardened = /['hH]$/.test(segment);
  const numericPart = segment.replace(/['hH]$/, '');
  if (!/^\d+$/.test(numericPart)) return null;
  const index = Number(numericPart);
  if (!Number.isSafeInteger(index) || index < 0 || index > MAX_BIP32_INDEX) return null;
  return { index, hardened };
};

export const validateHdPath = (input: string): HdPathValidationResult => {
  const normalized = normalizePath(input);
  if (!normalized) {
    return { valid: false, error: 'Enter a derivation path.' };
  }

  const parts = normalized.split('/');
  if (parts[0] !== 'm') {
    return { valid: false, error: "Path must start with 'm'." };
  }

  const segments: HdPathSegment[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const segment = parseSegment(parts[i]);
    if (!segment) {
      return { valid: false, error: `Invalid path segment: ${parts[i]}` };
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    return { valid: false, error: 'Path must include at least one segment.' };
  }

  return { valid: true, segments };
};

export const validateHdPathTemplate = (input: string): HdPathValidationResult => {
  const normalized = normalizePath(input);
  if (!normalized) {
    return { valid: false, error: 'Enter a derivation path.' };
  }

  const parts = normalized.split('/');
  if (parts[0] !== 'm') {
    return { valid: false, error: "Path must start with 'm'." };
  }

  const segments: HdPathSegment[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const segmentText = parts[i];
    if (!segmentText) {
      return { valid: false, error: `Invalid path segment: ${segmentText}` };
    }

    const isPlaceholder = segmentText === 'x' || segmentText === "x'";
    if (isPlaceholder) {
      continue;
    }

    const segment = parseSegment(segmentText);
    if (!segment) {
      return { valid: false, error: `Invalid path segment: ${segmentText}` };
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    return { valid: false, error: 'Path must include at least one segment.' };
  }

  return { valid: true, segments };
};

export const expandPathTemplate = (template: string, index: number) =>
  template.replace(/x('?)/g, `${index}$1`);
