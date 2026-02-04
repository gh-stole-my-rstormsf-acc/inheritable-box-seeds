import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';

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

const generateVault = async (page: any) => {
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await setNumericInput(page, 'input[data-path-count]', '1');
};

const fillPasswordFields = async (page: any, password = longPassword) => {
  await page.click('input[data-password]');
  await page.type('input[data-password]', password, { delay: 10 });
  await expect(page.locator('input[data-password]')).toHaveValue(password);
  await page.fill('input[data-confirm]', password);
};

const downloadVault = async (page: any, testInfo: any, filename: string) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-generate]')]);
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
  await page.selectOption('[data-argon-preset]', 'custom');
  await page.fill('[data-argon-time]', '4');
  await page.fill('[data-argon-memory]', '512');
  await page.fill('[data-argon-parallelism]', '4');
  await expect(page.locator('[data-preview-list] code')).toHaveCount(1);
  await fillPasswordFields(page);

  const vaultPath = await downloadVault(page, testInfo, 'vault-password.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-item code')).toHaveCount(1);

  const [csvDownload] = await Promise.all([
    vaultPage.waitForEvent('download'),
    vaultPage.click('[data-export]')
  ]);
  await csvDownload.saveAs(testInfo.outputPath('addresses.csv'));
});

test('shamir encryption flow', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await generateVault(page);
  await page.check('input[value="shamir"]');
  await page.fill('input[data-threshold]', '2');
  await page.fill('input[data-total]', '3');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-generate]')
  ]);

  const shareBlocks = page.locator('.share');
  const shares = [] as string[];
  for (let i = 0; i < 2; i += 1) {
    const share = shareBlocks.nth(i);
    const words = await share.locator('textarea').first().inputValue();
    shares.push(words);
  }

  const vaultPath = testInfo.outputPath('vault-shamir.html');
  await download.saveAs(vaultPath);

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
  const counts = page.locator('input[data-path-count]');
  await setNumericInput(page, 'input[data-path-count]', '1');
  if (await counts.count() > 1) {
    await setNumericInput(page, 'input[data-path-count]:nth-of-type(2)', '1');
  }
  await fillPasswordFields(page);

  const vaultPath = await downloadVault(page, testInfo, 'vault-multi-seed.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(2, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-item code')).toHaveCount(2);
});

test('password encryption flow with one seed and three passphrases', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonicAlt2);
  await page.click('[data-add-path]');
  await page.click('[data-add-path]');

  const passphrases = page.locator('input[data-path-passphrase]');
  await passphrases.nth(0).fill('passphrase-one');
  await passphrases.nth(1).fill('passphrase-two');
  await passphrases.nth(2).fill('passphrase-three');

  const counts = page.locator('input[data-path-count]');
  const total = await counts.count();
  for (let i = 0; i < total; i += 1) {
    await setNumericInput(page, `input[data-path-count]:nth-of-type(${i + 1})`, '1');
  }

  await fillPasswordFields(page);
  const vaultPath = await downloadVault(page, testInfo, 'vault-passphrases.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-item code')).toHaveCount(3);
});

test('password encryption flow with one seed, passphrase, and three HD paths', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-add-path]');
  await page.click('[data-add-path]');

  const paths = page.locator('input[data-path-value]');
  await paths.nth(0).fill("m/44'/60'/0'/0/x");
  await paths.nth(1).fill("m/44'/60'/1'/0/x");
  await paths.nth(2).fill("m/44'/60'/0'/1/x");

  const passphrases = page.locator('input[data-path-passphrase]');
  const passphrase = 'path-passphrase';
  await passphrases.nth(0).fill(passphrase);
  await passphrases.nth(1).fill(passphrase);
  await passphrases.nth(2).fill(passphrase);

  const counts = page.locator('input[data-path-count]');
  const total = await counts.count();
  for (let i = 0; i < total; i += 1) {
    await setNumericInput(page, `input[data-path-count]:nth-of-type(${i + 1})`, '1');
  }

  await fillPasswordFields(page);
  const vaultPath = await downloadVault(page, testInfo, 'vault-paths.html');
  const vaultPage = await decryptVault(context, vaultPath);
  await expect(vaultPage.locator('[data-seeds] .vault-seed')).toHaveCount(1, { timeout: 60000 });

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-item code')).toHaveCount(3);
});

test('password encryption flow with 2 seeds and 2 paths each', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.fill('textarea[data-seed-mnemonic]', mnemonic);
  await page.click('[data-add-seed]');

  const mnemonics = page.locator('textarea[data-seed-mnemonic]');
  await mnemonics.nth(1).fill(mnemonicAlt);

  await page.locator('[data-add-path]').nth(0).click();
  await page.locator('[data-add-path]').nth(1).click();

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

  await vaultPage.click('[data-derive]');
  await expect(vaultPage.locator('.derived-item code')).toHaveCount(4);
  await expect(vaultPage.locator('[data-derived] .passphrase [data-reveal]')).toHaveCount(4);
});
