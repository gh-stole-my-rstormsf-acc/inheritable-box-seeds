export interface CsvAddressRow {
  seedLabel: string;
  path: string;
  passphraseLabel: string;
  index: number;
  address: string;
}

const escapeCsv = (value: string | number) => {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const buildAddressCsv = (rows: CsvAddressRow[]) => {
  const header = ['seed_label', 'hd_path', 'passphrase_label', 'address'];
  const lines = [header.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push([
      escapeCsv(row.seedLabel),
      escapeCsv(row.path),
      escapeCsv(row.passphraseLabel),
      escapeCsv(row.address)
    ].join(','));
  }
  return lines.join('\n');
};
