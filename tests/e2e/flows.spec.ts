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

const STEP_SEQUENCE = ['seeds', 'paths', 'files', 'security', 'finalize'] as const;
type StepId = (typeof STEP_SEQUENCE)[number];

const getActiveStep = async (page: any): Promise<StepId> => {
  const active = page.locator('.wizard-step.is-active');
  const stepId = await active.getAttribute('data-step-link');
  if (!stepId || !STEP_SEQUENCE.includes(stepId as StepId)) {
    throw new Error(`Unable to read active wizard step. Received: ${stepId ?? 'null'}`);
  }
  return stepId as StepId;
};

const goToStep = async (page: any, step: 'seeds' | 'files' | 'paths' | 'security' | 'finalize') => {
  const targetIndex = STEP_SEQUENCE.indexOf(step as StepId);
  if (targetIndex < 0) throw new Error(`Unknown target step: ${step}`);

  for (let guard = 0; guard < STEP_SEQUENCE.length * 2; guard += 1) {
    const current = await getActiveStep(page);
    if (current === step) return;

    const currentIndex = STEP_SEQUENCE.indexOf(current);
    if (currentIndex < targetIndex) {
      const next = page.locator('[data-step-next]');
      await expect(next).toBeVisible();
      await expect(next).toBeEnabled();
      await next.click();
    } else {
      const prev = page.locator('[data-step-prev]');
      await expect(prev).toBeVisible();
      await expect(prev).toBeEnabled();
      await prev.click();
    }
  }

  throw new Error(`Failed to reach step "${step}" from wizard navigation controls.`);
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
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled({ timeout: 60000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-download-vault-html]')]);
  const vaultPath = testInfo.outputPath(filename);
  await download.saveAs(vaultPath);
  return vaultPath;
};

const openVault = async (context: any, vaultPath: string) => {
  const vaultPage = await context.newPage();
  await vaultPage.goto(pathToFileURL(vaultPath).toString());
  return vaultPage;
};

const decryptVault = async (context: any, vaultPath: string, password = longPassword) => {
  const vaultPage = await openVault(context, vaultPath);
  await vaultPage.fill('input[data-password]', password);
  await vaultPage.click('[data-decrypt-btn]');
  return vaultPage;
};

const openCreator = async (page: any) => {
  await page.goto('/');
  await expect(page.locator('[data-landing]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#home');
  await page.locator('[data-enter-creator]').first().click();
  await expect(page.locator('[data-step-link="seeds"]')).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#create');
};

test('landing and hash routing flows resolve to expected views', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-landing]')).toHaveCount(1);
  await expect(page.locator('[data-landing-workflow]')).toHaveCount(1);
  await expect(page.locator('[data-landing-use-cases]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#home');

  const offlineLink = page.locator('[data-download-offline-creator]');
  await expect(offlineLink).toBeVisible();
  await expect(offlineLink).toHaveText(/download for offline usage/i);
  await expect(offlineLink).toHaveAttribute(
    'href',
    'https://github.com/gh-stole-my-rstormsf-acc/inheritable-box-seeds/releases/latest/download/seed-vault-standalone.html'
  );

  await page.locator('[data-open-faq]').first().click();
  await expect(page.locator('[data-faq-page]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#faq');

  await page.goto('/#create');
  await expect(page.locator('[data-step-link="seeds"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-landing]')).toHaveCount(0);

  await page.goto('/#faq');
  await expect(page.locator('[data-faq-page]')).toHaveCount(1);
  await expect(page.locator('[data-landing]')).toHaveCount(0);
});

test('password encryption flow', async ({ page, context }, testInfo) => {
  await openCreator(page);
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
  expect(passwordVaultHtml).not.toContain('Creator FAQ');
  expect(passwordVaultHtml).not.toContain('data-faq-page');
  expect(passwordVaultHtml).not.toContain('data-view-switch');

  const vaultPage = await openVault(context, vaultPath);
  await expect(vaultPage.locator('[data-vault-seeds-section]')).toBeHidden();
  await expect(vaultPage.locator('[data-vault-files-section]')).toBeHidden();
  await expect(vaultPage.locator('[data-vault-derived-section]')).toBeHidden();
  await vaultPage.fill('input[data-password]', longPassword);
  await vaultPage.click('[data-decrypt-btn]');
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });
  await expect(vaultPage.locator('[data-vault-seeds-section]')).toBeVisible();
  await expect(vaultPage.locator('[data-vault-derived-section]')).toBeVisible();
  await expect(vaultPage.locator('[data-vault-files-section]')).toBeHidden();
  await expect(vaultPage.locator('[data-export]')).toBeDisabled();

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-table code')).toHaveCount(1);
  await expect(vaultPage.locator('[data-export]')).toBeEnabled();
  await expect(vaultPage.locator('[data-derived] th', { hasText: /^Index$/ })).toHaveCount(0);
  await expect(vaultPage.locator('[data-derived]')).not.toContainText(/Index\s+\d+/i);

  const [csvDownload] = await Promise.all([
    vaultPage.waitForEvent('download'),
    vaultPage.click('[data-export]')
  ]);
  await csvDownload.saveAs(testInfo.outputPath('addresses.csv'));
});

test('password encryption flow with attached files', async ({ page, context }, testInfo) => {
  await openCreator(page);
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
  await expect(vaultPage.locator('[data-vault-files-section]')).toBeVisible();
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

test('large attached files are exported as external encrypted bundles', async ({ page, context }, testInfo) => {
  await openCreator(page);
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'files');
  await page.check('input[data-files-enabled]');
  await expect(page.locator('[data-file-limit-tooltip]')).toHaveAttribute(
    'data-tooltip',
    /up to 10 MB.*separate encrypted bundle/i
  );

  const sourcePath = testInfo.outputPath('oversized-export.bin');
  const sourceBytes = Buffer.alloc(11 * 1024 * 1024, 7);
  await writeFile(sourcePath, sourceBytes);
  await page.setInputFiles('input[data-files-input]', sourcePath);

  await expect(page.locator('.vault-file')).toHaveCount(1);
  await expect(page.locator('[data-status-banner]')).toContainText(/separate encrypted bundle files/i);

  await goToStep(page, 'paths');
  await setNumericInput(page, 'input[data-path-count]', '1');
  await fillPasswordFields(page);
  await goToStep(page, 'finalize');
  await page.click('[data-generate]');
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('[data-download-external-bundle="0"]')).toBeVisible();

  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-download-vault-html]')
  ]);
  const [bundleDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('[data-download-external-bundle="0"]')
  ]);

  const vaultPath = testInfo.outputPath('vault-large-files.html');
  const encryptedBundlePath = testInfo.outputPath('oversized-export.svf');
  await htmlDownload.saveAs(vaultPath);
  await bundleDownload.saveAs(encryptedBundlePath);

  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-files] .vault-files__table')).toHaveCount(1, { timeout: 60000 });
  await expect(vaultPage.locator('[data-download-vault-file="0"]')).toContainText(/decrypt & download/i);
  await vaultPage.setInputFiles('[data-external-vault-file-input="0"]', encryptedBundlePath);

  const [download] = await Promise.all([
    vaultPage.waitForEvent('download', { timeout: 120000 }),
    vaultPage.click('[data-download-vault-file="0"]')
  ]);
  const decryptedPath = testInfo.outputPath('oversized-export.decrypted.bin');
  await download.saveAs(decryptedPath);

  const decryptedBytes = await readFile(decryptedPath);
  expect(Buffer.compare(decryptedBytes, sourceBytes)).toBe(0);
});

test('shamir encryption flow', async ({ page, context }, testInfo) => {
  await openCreator(page);
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

test('password encryption variant matrix', async ({ page, context }, testInfo) => {
  const scenarios = [
    {
      name: 'multiple seeds',
      outputFile: 'vault-multi-seed.html',
      expectedSeedCount: 2,
      expectedDerivedCount: 2,
      setup: async () => {
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
      }
    },
    {
      name: 'one seed and three passphrases',
      outputFile: 'vault-passphrases.html',
      expectedSeedCount: 1,
      expectedDerivedCount: 3,
      setup: async () => {
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
      }
    },
    {
      name: 'one seed, passphrase, and three HD paths',
      outputFile: 'vault-paths.html',
      expectedSeedCount: 1,
      expectedDerivedCount: 3,
      setup: async () => {
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
      }
    }
  ] as const;

  for (const scenario of scenarios) {
    await test.step(`password variant: ${scenario.name}`, async () => {
      await openCreator(page);
      await scenario.setup();
      await fillPasswordFields(page);

      const vaultPath = await downloadVault(page, testInfo, scenario.outputFile);
      const vaultPage = await decryptVault(context, vaultPath);
      await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(scenario.expectedSeedCount, {
        timeout: 60000
      });

      await vaultPage.click('[data-derive]');
      await expect(vaultPage.locator('.derived-table code')).toHaveCount(scenario.expectedDerivedCount);
      await vaultPage.close();
    });
  }
});

test('password encryption flow with 2 seeds and 2 paths each', async ({ page, context }, testInfo) => {
  await openCreator(page);
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

test('seed and path hot-path edits preserve section nodes', async ({ page }) => {
  await openCreator(page);

  const seedLabels = page.locator('input[data-seed-label]');
  await expect(seedLabels.nth(0)).toHaveValue('Seed 1');
  await page.fill('textarea[data-seed-mnemonic]', 'abandon abandon');
  await page.evaluate(() => {
    (window as Window & { __seedsSectionRef?: Element | null }).__seedsSectionRef =
      document.querySelector('[data-seeds-section]');
  });
  await page.click('[data-add-seed]');
  await expect(seedLabels.nth(1)).toHaveValue('Seed 2');
  const sameSeedsSectionAfterAdd = await page.evaluate(
    () =>
      (window as Window & { __seedsSectionRef?: Element | null }).__seedsSectionRef ===
      document.querySelector('[data-seeds-section]')
  );
  expect(sameSeedsSectionAfterAdd).toBe(true);
  await expect(page.locator('textarea[data-seed-mnemonic]').first()).toHaveValue('abandon abandon');

  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.locator('textarea[data-seed-mnemonic]').nth(1).fill(mnemonicAlt);
  await goToStep(page, 'paths');
  const pathLabel = page.locator('input[data-path-label]').first();
  await expect(pathLabel).toHaveValue('[Seed 1] BIP-44 Standard 1');
  await page.evaluate(() => {
    (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef =
      document.querySelector('[data-paths-section]');
  });

  await page.selectOption('select[data-path-preset]', 'ledger-legacy');
  await expect(pathLabel).toHaveValue('[Seed 1] Ledger Legacy 1');
  const samePathSectionAfterPreset = await page.evaluate(
    () =>
      (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef ===
      document.querySelector('[data-paths-section]')
  );
  expect(samePathSectionAfterPreset).toBe(true);

  await pathLabel.fill('Custom Path Label');
  await page.selectOption('select[data-path-preset]', 'ledger-live');
  await expect(pathLabel).toHaveValue('Custom Path Label');

  await page.locator('[data-add-path-seed]').first().click();
  await expect(page.locator('input[data-path-label]')).toHaveCount(3);
  await expect(pathLabel).toHaveValue('Custom Path Label');
  const samePathSectionAfterAdd = await page.evaluate(
    () =>
      (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef ===
      document.querySelector('[data-paths-section]')
  );
  expect(samePathSectionAfterAdd).toBe(true);

  await page.fill('input[data-path-value]', "m/44'/60'/0'/0/x");
  await expect(page.locator('[data-path-status]').first()).toContainText(/Path valid/i);
  const samePathSectionAfterPathEdit = await page.evaluate(
    () =>
      (window as Window & { __pathsSectionRef?: Element | null }).__pathsSectionRef ===
      document.querySelector('[data-paths-section]')
  );
  expect(samePathSectionAfterPathEdit).toBe(true);
});

test('files and security hot-path toggles preserve section nodes', async ({ page }) => {
  await openCreator(page);
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);

  await goToStep(page, 'files');
  await page.evaluate(() => {
    (window as Window & { __filesSectionRef?: Element | null }).__filesSectionRef =
      document.querySelector('[data-files-section]');
  });
  await page.check('input[data-files-enabled]');
  const sameFilesSectionAfterEnable = await page.evaluate(
    () =>
      (window as Window & { __filesSectionRef?: Element | null }).__filesSectionRef ===
      document.querySelector('[data-files-section]')
  );
  expect(sameFilesSectionAfterEnable).toBe(true);
  await expect(page.locator('input[data-files-input]')).toHaveCount(1);

  await page.uncheck('input[data-files-enabled]');
  const sameFilesSectionAfterDisable = await page.evaluate(
    () =>
      (window as Window & { __filesSectionRef?: Element | null }).__filesSectionRef ===
      document.querySelector('[data-files-section]')
  );
  expect(sameFilesSectionAfterDisable).toBe(true);
  await expect(page.locator('input[data-files-input]')).toHaveCount(0);

  await goToStep(page, 'security');
  await page.evaluate(() => {
    (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef =
      document.querySelector('[data-security-section]');
  });

  await page.selectOption('[data-argon-preset]', 'custom');
  await expect(page.locator('[data-argon-custom]')).toBeVisible();
  await expect(page.locator('[data-argon-preset-hint]')).toBeHidden();
  const sameSecuritySectionAfterPreset = await page.evaluate(
    () =>
      (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef ===
      document.querySelector('[data-security-section]')
  );
  expect(sameSecuritySectionAfterPreset).toBe(true);

  await page.check('input[value="shamir"]');
  await expect(page.locator('[data-threshold]')).toBeVisible();
  const sameSecuritySectionAfterShamirToggle = await page.evaluate(
    () =>
      (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef ===
      document.querySelector('[data-security-section]')
  );
  expect(sameSecuritySectionAfterShamirToggle).toBe(true);

  await page.check('input[value="password"]');
  await expect(page.locator('input[data-password]')).toBeVisible();
  const sameSecuritySectionAfterPasswordToggle = await page.evaluate(
    () =>
      (window as Window & { __securitySectionRef?: Element | null }).__securitySectionRef ===
      document.querySelector('[data-security-section]')
  );
  expect(sameSecuritySectionAfterPasswordToggle).toBe(true);
});

test('disables remove button when a seed has only one path', async ({ page }) => {
  await openCreator(page);
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

test('wizard step badges are non-interactive representation only', async ({ page }) => {
  await openCreator(page);
  const stepButtons = page.locator('[data-step-link]');
  await expect(stepButtons).toHaveCount(5);

  const total = await stepButtons.count();
  for (let index = 0; index < total; index += 1) {
    await expect(stepButtons.nth(index)).toBeDisabled();
  }

  await expect(page.locator('[data-step-link="seeds"]')).toHaveClass(/is-active/);
  await expect(page.click('[data-step-link="paths"]', { timeout: 1000 })).rejects.toThrow();
  await expect(page.locator('[data-step-link="seeds"]')).toHaveClass(/is-active/);
});

test('validation errors arm on next and clear after fixes across wizard steps', async ({ page }) => {
  await openCreator(page);

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/mnemonic/i);
  await expect(page.locator('textarea[data-seed-mnemonic]').first()).toHaveClass(/field-error/);

  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toHaveCount(0);
  await expect(page.locator('[data-step-link="paths"]')).toHaveClass(/is-active/);

  await page.fill('input[data-path-label]', '');
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/Path labels are required/i);
  await expect(page.locator('input[data-path-label]').first()).toHaveClass(/field-error/);

  await page.fill('input[data-path-label]', 'Main Path');
  await expect(page.locator('input[data-path-label]').first()).not.toHaveClass(/field-error/);
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toHaveCount(0);
  await expect(page.locator('[data-step-link="files"]')).toHaveClass(/is-active/);

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-link="security"]')).toHaveClass(/is-active/);

  const passwordInput = page.locator('input[data-password]');
  const confirmInput = page.locator('input[data-confirm]');
  await expect(passwordInput).not.toHaveClass(/field-error/);
  await expect(passwordInput).toHaveAttribute('type', 'password');
  await expect(confirmInput).toHaveAttribute('type', 'password');

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/Password is required/i);
  await expect(passwordInput).toHaveClass(/field-error/);

  await passwordInput.fill('ValidPassword123!');
  await expect(passwordInput).not.toHaveClass(/field-error/);
  await confirmInput.fill('DifferentPassword123!');
  await page.check('input[data-password-visibility]');

  await expect(passwordInput).toHaveAttribute('type', 'text');
  await expect(confirmInput).toHaveAttribute('type', 'text');

  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-error]')).toContainText(/confirmation does not match/i);
  await expect(confirmInput).toHaveClass(/field-error/);

  await confirmInput.fill('ValidPassword123!');
  await expect(confirmInput).not.toHaveClass(/field-error/);
  await page.click('[data-step-next]');
  await expect(page.locator('[data-step-link="finalize"]')).toHaveClass(/is-active/);
});

test('shamir mode shows generate button and renders shares after generate', async ({ page }, testInfo) => {
  await openCreator(page);
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

test('finalize locks generate and back after successful generation', async ({ page }) => {
  await openCreator(page);
  await generateVault(page);
  await fillPasswordFields(page);
  await goToStep(page, 'finalize');

  const generateButton = page.locator('[data-generate]');
  const previousButton = page.locator('[data-step-prev]');
  await expect(generateButton).toBeEnabled();
  await expect(previousButton).toBeEnabled();

  await generateButton.click();
  await expect(page.locator('[data-download-vault-html]')).toBeEnabled();
  await expect(generateButton).toBeDisabled();
  await expect(previousButton).toBeDisabled();
});

test('creator FAQ header toggle works and preserves wizard state', async ({ page }) => {
  await openCreator(page);
  await expect(page.locator('[data-view-switch="landing"]')).toHaveCount(0);
  await expect(page.locator('[data-faq-page]')).toHaveCount(0);

  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await goToStep(page, 'paths');
  await page.fill('input[data-path-label]', 'State Preservation Path');
  await expect(page.locator('[data-step-link="paths"]')).toHaveClass(/is-active/);

  await page.click('[data-view-switch="faq"]');
  await expect(page.locator('[data-faq-page]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#faq');

  const categoryButtons = page.locator('[data-faq-category]');
  expect(await categoryButtons.count()).toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-faq-entry-toggle]').first()).toBeVisible();

  const firstEntryId = await page.locator('[data-faq-entry-toggle]').first().getAttribute('data-faq-entry-toggle');
  expect(firstEntryId).not.toBeNull();
  const answer = page.locator(`[data-faq-entry-answer="${firstEntryId!}"]`);
  await expect(answer).toBeHidden();
  await page.locator('[data-faq-entry-toggle]').first().click();
  await expect(answer).toBeVisible();

  await categoryButtons.nth(1).click();
  await expect(page.locator('[data-faq-entry-toggle]').first()).toBeVisible();

  await page.click('[data-view-switch="wizard"]');
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#create');
  await expect(page.locator('[data-step-link="paths"]')).toHaveClass(/is-active/);
  await expect(page.locator('input[data-path-label]').first()).toHaveValue('State Preservation Path');
});
