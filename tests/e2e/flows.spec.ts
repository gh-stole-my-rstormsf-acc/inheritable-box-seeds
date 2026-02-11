import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';
import { readFile, writeFile } from 'node:fs/promises';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const mnemonicAlt = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const mnemonicAlt2 = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const longPassword =
  'Correct-Horse-Battery-Staple-1234567890-!@#$%^&*()-_+=LongPasswordTest';

const setNumericInput = async (page: any, selector: string, value: string) => {
  await page.evaluate(([targetSelector, nextValue]) => {
    const input = document.querySelector<HTMLInputElement>(targetSelector);
    if (!input) throw new Error(`Missing input: ${targetSelector}`);
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [selector, value]);
};

const setNumericInputByLocator = async (locator: any, value: string) => {
  await locator.evaluate((input: HTMLInputElement, nextValue: string) => {
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};

const goToStep = async (page: any, step: 'seeds' | 'files' | 'paths' | 'security' | 'finalize') => {
  await page.click(`[data-step-link="${step}"]`);
};

const addPathToSeedIndex = async (page: any, seedIndex: number) => {
  await page.locator('[data-add-path-seed]').nth(seedIndex).click();
};

const prepareShamirShares = async (page: any) => {
  const prepareButton = page.locator('[data-prepare-shamir]');
  await expect(prepareButton).toBeVisible();
  await prepareButton.click();
  await expect(page.locator('[data-shamir-prep-status]')).toContainText(/can continue to finalize/i);
};

const generateVault = async (page: any) => {
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');
  await setNumericInput(page, 'input[data-path-count]', '1');
};

const fillPasswordFields = async (page: any, password = longPassword) => {
  await goToStep(page, 'security');
  await page.click('input[data-password]');
  await page.type('input[data-password]', password, { delay: 10 });
  await expect(page.locator('input[data-password]')).toHaveValue(password);
  await page.fill('input[data-confirm]', password);
};

const downloadVault = async (page: any, testInfo: any, filename: string) => {
  await goToStep(page, 'finalize');
  await page.click('[data-generate]');
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-download-vault-html]')]);
  const vaultPath = testInfo.outputPath(filename);
  await download.saveAs(vaultPath);
  return vaultPath;
};

const decryptVault = async (context: any, vaultPath: string, password = longPassword) => {
  const vaultPage = await context.newPage();
  await vaultPage.goto(pathToFileURL(vaultPath).toString());
  await vaultPage.fill('input[data-password]', password);
  await vaultPage.click('[data-decrypt-btn]');
  return vaultPage;
};

test('password encryption flow', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await generateVault(page);
  await expect(page.locator('[data-preview-list] code')).toHaveCount(1);
  await goToStep(page, 'security');
  await page.selectOption('[data-argon-preset]', 'custom');
  await page.fill('[data-argon-time]', '4');
  await page.fill('[data-argon-memory]', '512');
  await page.fill('[data-argon-parallelism]', '4');
  await fillPasswordFields(page);

  const vaultPath = await downloadVault(page, testInfo, 'vault-password.html');
  const [cipherDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-download-cipher-md]')
  ]);
  const cipherPath = testInfo.outputPath('cipher-password.md');
  await cipherDownload.saveAs(cipherPath);
  const cipherMd = await readFile(cipherPath, 'utf8');
  expect(cipherMd).toContain('## Ciphertext (base64)');
  expect(cipherMd).toContain('argon2-browser@^1.18.0');
  expect(cipherMd).toContain('@noble/post-quantum@^0.2.0');

  const passwordVaultHtml = await readFile(vaultPath, 'utf8');
  expect(passwordVaultHtml).toContain('VAULT_RUNTIME_MODE: password-only');
  expect(passwordVaultHtml).not.toContain('Printable Ciphertext');
  expect(passwordVaultHtml).not.toContain('PRINT_THIS_CIPHERTEXT_BASE64');
  expect(passwordVaultHtml).not.toContain('data-ciphertext-print');
  expect(passwordVaultHtml).toContain('argon2.wasm');
  expect(passwordVaultHtml).not.toContain('Share must include id prefix like "1: <share>".');

  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(1);
  await expect(vaultPage.locator('[data-derived] th', { hasText: /^Index$/ })).toHaveCount(0);
  await expect(vaultPage.locator('[data-derived]')).not.toContainText(/Index\s+\d+/i);

  const [csvDownload] = await Promise.all([
    vaultPage.waitForEvent('download'),
    vaultPage.click('[data-export]')
  ]);
  await csvDownload.saveAs(testInfo.outputPath('addresses.csv'));
});

test('password encryption flow with attached files', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'files');
  await page.check('input[data-files-enabled]');

  const sourcePath = testInfo.outputPath('keepass-export.kdbx');
  const sourceBytes = Buffer.from('demo-keepass-export-data', 'utf8');
  await writeFile(sourcePath, sourceBytes);
  await page.setInputFiles('input[data-files-input]', sourcePath);

  await expect(page.locator('.vault-file')).toHaveCount(1);
  await page.locator('input[data-file-label]').first().fill('Primary Password Export');
  await page.locator('input[data-file-hint]').first().fill('Open with KeePassXC');

  await goToStep(page, 'paths');
  await setNumericInput(page, 'input[data-path-count]', '1');
  await fillPasswordFields(page);

  const vaultPath = await downloadVault(page, testInfo, 'vault-with-files.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-files] .vault-files__table')).toHaveCount(1, { timeout: 60000 });
  await expect(vaultPage.locator('[data-files]')).toContainText('Primary Password Export');
  await expect(vaultPage.locator('[data-files]')).toContainText('Open with KeePassXC');

  const [download] = await Promise.all([
    vaultPage.waitForEvent('download'),
    vaultPage.click('[data-download-vault-file="0"]')
  ]);
  const downloadedPath = testInfo.outputPath('decrypted-keepass-export.kdbx');
  await download.saveAs(downloadedPath);
  const downloadedBytes = await readFile(downloadedPath);
  expect(Buffer.compare(downloadedBytes, sourceBytes)).toBe(0);
});

test('shamir encryption flow', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await generateVault(page);
  await goToStep(page, 'security');
  await page.check('input[value="shamir"]');
  await page.fill('input[data-threshold]', '2');
  await page.fill('input[data-total]', '3');
  await prepareShamirShares(page);
  await goToStep(page, 'finalize');
  await page.click('[data-generate]');
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled();

  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-download-vault-html]')
  ]);
  const [cipherDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-download-cipher-md]')
  ]);

  const shareBlocks = page.locator('.share');
  const shares = [] as string[];
  for (let i = 0; i < 2; i += 1) {
    const share = shareBlocks.nth(i);
    const words = await share.locator('textarea').first().inputValue();
    shares.push(words);
  }

  const vaultPath = testInfo.outputPath('vault-shamir.html');
  await htmlDownload.saveAs(vaultPath);
  const cipherPath = testInfo.outputPath('cipher-shamir.md');
  await cipherDownload.saveAs(cipherPath);
  const cipherMd = await readFile(cipherPath, 'utf8');
  expect(cipherMd).toContain('## Ciphertext (base64)');
  expect(cipherMd).toContain('@scure/bip39@^1.3.0');
  expect(cipherMd).not.toContain('argon2-browser@^1.18.0');

  const shamirVaultHtml = await readFile(vaultPath, 'utf8');
  expect(shamirVaultHtml).toContain('VAULT_RUNTIME_MODE: shamir-only');
  expect(shamirVaultHtml).not.toContain('Printable Ciphertext');
  expect(shamirVaultHtml).not.toContain('PRINT_THIS_CIPHERTEXT_BASE64');
  expect(shamirVaultHtml).not.toContain('data-ciphertext-print');
  expect(shamirVaultHtml).toContain('Share must include id prefix like "1: <share>".');
  expect(shamirVaultHtml).not.toContain('argon2.wasm');

  const vaultPage = await context.newPage();
  await vaultPage.goto(pathToFileURL(vaultPath).toString());

  const valueInputs = vaultPage.locator('textarea[data-share-value]');
  await valueInputs.nth(0).fill('bad share');
  await valueInputs.nth(1).fill(shares[1]);
  await vaultPage.click('[data-decrypt-btn]');
  await expect(vaultPage.locator('[data-status]')).toContainText(/id prefix/i);

  for (let i = 0; i < shares.length; i += 1) {
    await valueInputs.nth(i).fill(shares[i]);
  }

  await vaultPage.click('[data-decrypt-btn]');
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });
});

test('password encryption flow with multiple seeds', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-add-seed]');
  const mnemonics = page.locator('textarea[data-seed-mnemonic]');
  await mnemonics.nth(1).fill(mnemonicAlt);
  const seedLabels = page.locator('input[data-seed-label]');
  await seedLabels.nth(0).fill('Seed One');
  await seedLabels.nth(1).fill('Seed Two');
  await goToStep(page, 'paths');
  const counts = page.locator('input[data-path-count]');
  const totalCounts = await counts.count();
  for (let i = 0; i < totalCounts; i += 1) {
    await setNumericInputByLocator(counts.nth(i), '1');
  }
  await fillPasswordFields(page);

  const vaultPath = await downloadVault(page, testInfo, 'vault-multi-seed.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(2, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(2);
});

test('password encryption flow with one seed and three passphrases', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonicAlt2);
  await goToStep(page, 'paths');
  await addPathToSeedIndex(page, 0);
  await addPathToSeedIndex(page, 0);
  await expect(page.locator('.path__seed-badge').first()).toContainText('Seed: Seed 1');

  const passphrases = page.locator('input[data-path-passphrase]');
  await passphrases.nth(0).fill('passphrase-one');
  await passphrases.nth(1).fill('passphrase-two');
  await passphrases.nth(2).fill('passphrase-three');
  const passphraseLabels = page.locator('input[data-path-passphrase-label]');
  await passphraseLabels.nth(0).fill('Label One');
  await passphraseLabels.nth(1).fill('Label Two');
  await passphraseLabels.nth(2).fill('Label Three');

  const counts = page.locator('input[data-path-count]');
  const total = await counts.count();
  for (let i = 0; i < total; i += 1) {
    await setNumericInputByLocator(counts.nth(i), '1');
  }

  await fillPasswordFields(page);
  const vaultPath = await downloadVault(page, testInfo, 'vault-passphrases.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(3);
});

test('password encryption flow with one seed, passphrase, and three HD paths', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');
  await addPathToSeedIndex(page, 0);
  await addPathToSeedIndex(page, 0);

  const paths = page.locator('input[data-path-value]');
  await paths.nth(0).fill("m/44'/60'/0'/0/x");
  await paths.nth(1).fill("m/44'/60'/1'/0/x");
  await paths.nth(2).fill("m/44'/60'/0'/1/x");

  const passphrases = page.locator('input[data-path-passphrase]');
  const passphrase = 'path-passphrase';
  await passphrases.nth(0).fill(passphrase);
  await passphrases.nth(1).fill(passphrase);
  await passphrases.nth(2).fill(passphrase);
  const passphraseLabels = page.locator('input[data-path-passphrase-label]');
  await passphraseLabels.nth(0).fill('Main');
  await passphraseLabels.nth(1).fill('Savings');
  await passphraseLabels.nth(2).fill('Backup');

  const counts = page.locator('input[data-path-count]');
  const total = await counts.count();
  for (let i = 0; i < total; i += 1) {
    await setNumericInputByLocator(counts.nth(i), '1');
  }

  await fillPasswordFields(page);
  const vaultPath = await downloadVault(page, testInfo, 'vault-paths.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(3);
});

test('password encryption flow with 2 seeds and 2 paths each', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-add-seed]');

  const mnemonics = page.locator('textarea[data-seed-mnemonic]');
  await mnemonics.nth(1).fill(mnemonicAlt);
  const seedLabels = page.locator('input[data-seed-label]');
  await seedLabels.nth(0).fill('Seed One');
  await seedLabels.nth(1).fill('Seed Two');

  await goToStep(page, 'paths');
  await addPathToSeedIndex(page, 0);
  await addPathToSeedIndex(page, 1);
  await expect(page.locator('.path__seed-badge').filter({ hasText: 'Seed: Seed One' })).toHaveCount(2);
  await expect(page.locator('.path__seed-badge').filter({ hasText: 'Seed: Seed Two' })).toHaveCount(2);

  const pathValues = [
    "m/44'/60'/0'/0/x",
    "m/44'/60'/1'/0/x",
    "m/44'/60'/0'/1/x",
    "m/44'/60'/2'/0/x"
  ];
  const passphrases = ['seed-one-a', 'seed-one-b', 'seed-two-a', 'seed-two-b'];

  const pathInputs = page.locator('input[data-path-value]');
  for (let i = 0; i < pathValues.length; i += 1) {
    await pathInputs.nth(i).fill(pathValues[i]);
  }

  const passInputs = page.locator('input[data-path-passphrase]');
  for (let i = 0; i < passphrases.length; i += 1) {
    await passInputs.nth(i).fill(passphrases[i]);
  }
  const passphraseLabels = ['Seed One A', 'Seed One B', 'Seed Two A', 'Seed Two B'];
  const labelInputs = page.locator('input[data-path-passphrase-label]');
  for (let i = 0; i < passphraseLabels.length; i += 1) {
    await labelInputs.nth(i).fill(passphraseLabels[i]);
  }

  const countInputs = page.locator('input[data-path-count]');
  const totalCounts = await countInputs.count();
  for (let i = 0; i < totalCounts; i += 1) {
    await setNumericInputByLocator(countInputs.nth(i), '1');
  }

  await fillPasswordFields(page);
  const vaultPath = await downloadVault(page, testInfo, 'vault-two-seeds.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(2, { timeout: 60000 });
  await expect(vaultPage.locator('[data-seeds] .passphrase [data-reveal]')).toHaveCount(4);
  await expect(vaultPage.locator('[data-seeds] .passphrase__label-key')).toHaveCount(4);
  await expect(vaultPage.locator('[data-seeds] .passphrase__label-key').first()).toHaveText('Passphrase Label');
  await expect(vaultPage.locator('[data-seeds] .passphrase__label-value').first()).toHaveText('Seed One A');

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('[data-derived] .derived-table')).toHaveCount(1);
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(4);
  await expect(vaultPage.locator('[data-derived] [data-reveal]')).toHaveCount(4);
});

test('assigns default seed labels by index', async ({ page }) => {
  await page.goto('/');

  const seedLabels = page.locator('input[data-seed-label]');
  await expect(seedLabels.nth(0)).toHaveValue('Seed 1');

  await page.click('[data-add-seed]');
  await expect(seedLabels.nth(1)).toHaveValue('Seed 2');
});

test('add seed does not replace seeds section and preserves in-progress mnemonic', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', 'abandon abandon');
  await page.evaluate(() => {
    (window as Window & { __seedsSectionRef?: Element | null }).__seedsSectionRef =
      document.querySelector('[data-seeds-section]');
  });

  await page.click('[data-add-seed]');
  await expect(page.locator('textarea[data-seed-mnemonic]')).toHaveCount(2);

  const sameSectionAfterAdd = await page.evaluate(
    () =>
      (window as Window & { __seedsSectionRef?: Element | null }).__seedsSectionRef ===
      document.querySelector('[data-seeds-section]')
  );
  expect(sameSectionAfterAdd).toBe(true);
  await expect(page.locator('textarea[data-seed-mnemonic]').first()).toHaveValue('abandon abandon');
});

test('auto-updates path label from preset until manually overridden', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');

  const pathLabel = page.locator('input[data-path-label]').first();
  await expect(pathLabel).toHaveValue('[Seed 1] BIP-44 Standard 1');

  await page.selectOption('select[data-path-preset]', 'ledger-legacy');
  await expect(pathLabel).toHaveValue('[Seed 1] Ledger Legacy 1');

  await pathLabel.fill('Custom Path Label');
  await page.selectOption('select[data-path-preset]', 'ledger-live');
  await expect(pathLabel).toHaveValue('Custom Path Label');
});

test('add path does not replace paths section and preserves in-progress field values', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');

  await page.fill('input[data-path-label]', 'Draft Label');
  await page.evaluate(() => {
    (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef =
      document.querySelector('[data-paths-section]');
  });

  await page.locator('[data-add-path-seed]').first().click();
  await expect(page.locator('input[data-path-label]')).toHaveCount(2);
  const sameSectionAfterOpen = await page.evaluate(
    () =>
      (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef ===
      document.querySelector('[data-paths-section]')
  );
  expect(sameSectionAfterOpen).toBe(true);
  await expect(page.locator('input[data-path-label]').first()).toHaveValue('Draft Label');
});

test('disables remove button when a seed has only one path', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');

  const singlePathRemove = page.locator('[data-remove-path]').first();
  await expect(singlePathRemove).toBeDisabled();
  await expect(singlePathRemove).toHaveAttribute('data-tooltip', /only path for this seed/i);

  await addPathToSeedIndex(page, 0);
  await expect(page.locator('[data-remove-path]')).toHaveCount(2);
  await expect(page.locator('[data-remove-path]').first()).toBeEnabled();
  await expect(page.locator('[data-remove-path]').nth(1)).toBeEnabled();

  await page.locator('[data-remove-path]').nth(1).click();
  await expect(page.locator('[data-remove-path]')).toHaveCount(1);
  await expect(page.locator('[data-remove-path]').first()).toBeDisabled();
});

test('shows step error near next and clears it after fixing seed input', async ({ page }) => {
  await page.goto('/');

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/mnemonic/i);
  await expect(page.locator('textarea[data-seed-mnemonic]').first()).toHaveClass(/field-error/);

  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toHaveCount(0);
  await expect(page.locator('[data-step-link="paths"]')).toHaveClass(/is-active/);
});

test('shows path step error with red field and clears after fix', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');

  await page.fill('input[data-path-label]', '');
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/Path labels are required/i);
  await expect(page.locator('input[data-path-label]').first()).toHaveClass(/field-error/);

  await page.fill('input[data-path-label]', 'Main Path');
  await expect(page.locator('input[data-path-label]').first()).not.toHaveClass(/field-error/);
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toHaveCount(0);
  await expect(page.locator('[data-step-link="files"]')).toHaveClass(/is-active/);
});

test('does not show password error on security step until next is clicked', async ({ page }) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'security');

  const passwordInput = page.locator('input[data-password]');
  await expect(passwordInput).not.toHaveClass(/field-error/);

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/Password is required/i);
  await expect(passwordInput).toHaveClass(/field-error/);

  await passwordInput.fill('ValidPassword123!');
  await expect(passwordInput).not.toHaveClass(/field-error/);
});

test('shamir mode shows generate button and renders shares after generate', async ({ page }, testInfo) => {
  await page.goto('/');
  await generateVault(page);

  await goToStep(page, 'security');
  await page.check('input[value="shamir"]');
  await page.evaluate(() => {
    (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef =
      document.querySelector('.wizard-card');
  });
  await page.fill('input[data-threshold]', '2');
  await page.fill('input[data-total]', '3');
  const sameSecuritySectionAfterShamirInputs = await page.evaluate(
    () =>
      (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef ===
      document.querySelector('.wizard-card')
  );
  expect(sameSecuritySectionAfterShamirInputs).toBe(true);
  await expect(page.locator('[data-step-next]')).toBeDisabled();
  await prepareShamirShares(page);
  await expect(page.locator('[data-step-next]')).toBeEnabled();
  await goToStep(page, 'finalize');

  const generateButton = page.locator('[data-generate]');
  await expect(generateButton).toBeVisible();
  await expect(generateButton).toHaveText(/Generate Vault/i);
  await page.click('[data-generate]');
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-download-vault-html]')
  ]);
  await download.saveAs(testInfo.outputPath('vault-shamir-generate-visibility.html'));

  await expect(page.locator('.shares h3')).toHaveText(/Shamir Shares/i);
  await expect(page.locator('.share')).toHaveCount(3);
});
