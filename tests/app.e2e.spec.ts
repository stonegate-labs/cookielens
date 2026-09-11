import { expect, test, type Page } from '@playwright/test';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { TOKEN_PROGRAM } from '../src/domain';
import { parsedValue, rawValue, token } from './fixtures';

const GENESIS = '1'.repeat(32);
const ADDRESS = new PublicKey(new Uint8Array(32).fill(4)).toBase58();
const NEXT = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
const SIG = bs58.encode(new Uint8Array(64).fill(8));
type Mode = 'healthy' | 'offline' | 'limited' | 'malformed' | 'empty';
async function mockRpc(page: Page) {
  const control = { mode: 'healthy' as Mode, calls: 0, balance: '1234567890', stale: false };
  await page.route('https://rpc.cookiescan.io/**', async route => {
    control.calls++;
    if (control.mode === 'offline') { await route.abort('internetdisconnected'); return; }
    if (control.mode === 'limited') { await route.fulfill({ status: 429, body: '' }); return; }
    if (control.mode === 'malformed') { await route.fulfill({ status: 200, body: 'invalid JSON' }); return; }
    const request = route.request().postDataJSON() as { id: number; method: string; params: unknown[] };
    const context = { slot: control.stale ? 0 : 10 };
    const account = token(ADDRESS);
    let result: unknown;
    switch (request.method) {
      case 'getGenesisHash': result = GENESIS; break;
      case 'getBalance': result = { context, value: control.mode === 'empty' ? '0' : control.balance }; break;
      case 'getTokenAccountsByOwner': result = { context, value: control.mode === 'empty' ? [] : [parsedValue(account)] }; break;
      case 'getSignaturesForAddress': result = control.mode === 'empty' ? [] : [{ signature: SIG, slot: 10, blockTime: null, err: null, confirmationStatus: 'confirmed' }]; break;
      case 'getTransaction': result = null; break;
      case 'getAccountInfo': result = { context, value: request.params[0] === TOKEN_PROGRAM ? { executable: true } : rawValue(account) }; break;
      case 'getLatestBlockhash': result = { context, value: { blockhash: ADDRESS, lastValidBlockHeight: 100 } }; break;
      case 'getFeeForMessage': result = { context, value: 5000 }; break;
      case 'simulateTransaction': result = { context, value: { err: null } }; break;
      case 'getBlockHeight': result = 20; break;
      default: throw new Error(`Unexpected browser RPC: ${request.method}`);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) });
  });
  return control;
}
async function mockNightly(page: Page, rejected = false, switchAddress = false) {
  await page.addInitScript(({ address, next, rejected, switchAddress }) => {
    let current = address;
    const events = new Map<string, ((value?: unknown) => void)[]>();
    const provider = {
      isConnected: false,
      accounts: [] as { address: string }[],
      publicKey: { toBase58: () => '11111111111111111111111111111111' },
      chainInfo: { provider: 'https://api.mainnet-beta.solana.com' },
      changeNetwork: async (network: { url: string }) => {
        document.documentElement.dataset.networkRequest = JSON.stringify(network);
        provider.chainInfo.provider = network.url;
        provider.accounts = [];
        provider.isConnected = false;
        for (const fn of events.get('accountChanged') ?? []) fn(null);
        if (switchAddress) current = next;
      },
      connect: async () => { if (rejected) throw new Error('Connection rejected'); provider.isConnected = true; provider.accounts = [{ address: current }]; document.documentElement.dataset.connectCalls = String(Number(document.documentElement.dataset.connectCalls ?? '0') + 1); return { publicKey: provider.publicKey }; },
      disconnect: async () => { provider.isConnected = false; for (const fn of events.get('disconnect') ?? []) fn(); },
      on: (name: string, fn: (value?: unknown) => void) => { events.set(name, [...(events.get(name) ?? []), fn]); },
      removeListener: (name: string, fn: (value?: unknown) => void) => { events.set(name, (events.get(name) ?? []).filter(item => item !== fn)); },
      signTransaction: async () => {
        document.documentElement.dataset.signedProvider = provider.chainInfo.provider;
        document.documentElement.dataset.signedAddress = provider.accounts[0]?.address;
        document.documentElement.dataset.signCalls = String(Number(document.documentElement.dataset.signCalls ?? '0') + 1);
        throw new Error('Approval rejected');
      },
    };
    Object.defineProperty(window, 'nightly', { value: { solana: provider }, configurable: true });
    window.addEventListener('fixture-account-switch', () => {
      current = next;
      provider.accounts = [{ address: current }];
      for (const fn of events.get('accountChanged') ?? []) fn(provider.publicKey);
    });
  }, { address: ADDRESS, next: NEXT, rejected, switchAddress });
}
async function inspect(page: Page) {
  await page.getByLabel('Inspect a public wallet').fill(ADDRESS);
  await page.getByRole('button', { name: 'Inspect address', exact: true }).click();
  await expect(page.getByText('Native balance', { exact: true })).toBeVisible();
}

async function mockStandard(page: Page, custom: boolean) {
  await page.addInitScript(({ address, genesis, custom }) => {
    const chains = custom ? ['solana:' + genesis.slice(0, 32)] : ['solana:mainnet', 'solana:mainnet-beta', 'solana:testnet', 'solana:devnet'];
    const account = { address, chains, features: ['solana:signTransaction'] };
    const wallet = {
      name: 'Nightly',
      features: {
        'standard:connect': { connect: async () => ({ accounts: [account] }) },
        'standard:disconnect': { disconnect: async () => undefined },
        'standard:events': { on: () => () => undefined },
        'solana:signTransaction': { signTransaction: async (input: { chain: string }) => {
          document.documentElement.dataset.standardSignChain = input.chain;
          throw new Error('Approval rejected');
        } },
      },
    };
    window.addEventListener('wallet-standard:app-ready', event => {
      (event as CustomEvent<{ register: (wallet: unknown) => void }>).detail.register(wallet);
    });
  }, { address: ADDRESS, genesis: GENESIS, custom });
}

test('missing extension and rejected connection are visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await expect(page.getByRole('alert')).toContainText('not installed');
  await mockNightly(page, true); await page.reload();
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await expect(page.getByRole('alert')).toContainText('Connection rejected');
});
test('connection, account switch and disconnect clear stale unsigned work', async ({ page }) => {
  await mockRpc(page); await mockNightly(page); await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await expect(page.getByRole('region', { name: 'Connected wallet' })).toContainText(ADDRESS);
  await page.getByRole('button', { name: 'Review reclaim' }).click();
  await expect(page.getByText('Gross refundable COOK', { exact: true })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-sign-calls')).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('fixture-account-switch')));
  await expect(page.getByRole('region', { name: 'Connected wallet' })).toContainText(NEXT);
  await expect(page.getByText('Gross refundable COOK', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect Nightly' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Connected wallet' })).toHaveCount(0);
});
test('public inspection validates before requests and never offers reclaim', async ({ page }) => {
  const control = await mockRpc(page); await page.goto('/');
  await page.getByLabel('Inspect a public wallet').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Inspect address', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('32-byte'); expect(control.calls).toBe(0);
  await inspect(page);
  await expect(page.getByRole('button', { name: 'Review reclaim' })).toHaveCount(0);
  await expect(page.getByText('Timestamp unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('Detail unavailable or pruned')).toBeVisible();
});
for (const standard of [false, true]) {
  test('explicit final approval is the only signing trigger (standard fallback: ' + standard + ')', async ({ page }) => {
    if (standard) await mockStandard(page, false);
    await mockRpc(page); await mockNightly(page); await page.goto('/');
    await page.getByRole('button', { name: 'Connect Nightly' }).click();
    await page.getByRole('button', { name: 'Review reclaim' }).click();
    await expect(page.getByText('Estimated net return', { exact: true })).toBeVisible();
    expect(await page.locator('html').getAttribute('data-sign-calls')).toBeNull();
    expect(await page.locator('html').getAttribute('data-network-request')).toBeNull();
    await page.getByRole('button', { name: 'Confirm and request Nightly approval' }).click();
    await expect(page.getByText('Nightly approval was rejected or interrupted. Nothing was broadcast.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-sign-calls', '1');
    await expect(page.locator('html')).toHaveAttribute('data-network-request', JSON.stringify({ url: 'https://rpc.cookiescan.io' }));
    await expect(page.locator('html')).toHaveAttribute('data-signed-provider', 'https://rpc.cookiescan.io');
    await expect(page.locator('html')).toHaveAttribute('data-signed-address', ADDRESS);
    await expect(page.locator('html')).toHaveAttribute('data-connect-calls', '2');
  });}

test('refresh preserves real stale data during offline, rate-limited and malformed responses', async ({ page }) => {
  const control = await mockRpc(page); await page.goto('/'); await inspect(page);
  await expect(page.getByText('1234567890 base units', { exact: true })).toBeVisible();
  for (const mode of ['offline', 'limited', 'malformed'] as const) {
    control.mode = mode;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('Refresh unavailable. Displayed data is stale.', { exact: true })).toBeVisible();
    await expect(page.getByText('1234567890 base units', { exact: true })).toBeVisible();
  }
  control.mode = 'healthy'; control.balance = '2000000000';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('2000000000 base units', { exact: true })).toBeVisible({ timeout: 15000 });
});
test('empty wallets and keyboard flows remain usable without page overflow', async ({ page }, testInfo) => {
  const control = await mockRpc(page); control.mode = 'empty'; await page.goto('/');
  const field = page.getByLabel('Inspect a public wallet');
  await field.focus(); await field.fill(ADDRESS); await field.press('Enter');
  await expect(page.getByText('No legacy token accounts', { exact: true })).toBeVisible();
  await expect(page.getByText('No recent signatures returned', { exact: true })).toBeVisible();
  await page.getByText('Daily activity table', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('empty-wallet.png'), fullPage: true });
});
test('overview, activity, chart and reclaim preview fit both configured widths', async ({ page }, testInfo) => {
  await mockRpc(page); await mockNightly(page); await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await page.getByRole('button', { name: 'Review reclaim' }).click();
  await expect(page.getByText('Estimated net return', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reclaim-preview.png'), fullPage: true });
});
test('inspecting the same public address again loads fresh data and remains read-only', async ({ page }) => {
  const control = await mockRpc(page); await page.goto('/'); await inspect(page);
  await expect(page.getByText('1234567890 base units', { exact: true })).toBeVisible();
  const calls = control.calls;
  control.balance = '2000000000';
  await page.getByRole('button', { name: 'Inspect address', exact: true }).click();
  await expect(page.getByText('2000000000 base units', { exact: true })).toBeVisible();
  await expect(page.getByText('1234567890 base units', { exact: true })).toHaveCount(0);
  expect(control.calls).toBeGreaterThan(calls);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Review reclaim' })).toHaveCount(0);
});
test('repeat inspection of the connected wallet cancels its unsigned preview and reloads', async ({ page }) => {
  const control = await mockRpc(page); await mockNightly(page); await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await page.getByRole('button', { name: 'Review reclaim' }).click();
  await expect(page.getByText('Gross refundable COOK', { exact: true })).toBeVisible();
  control.balance = '3000000000';
  await page.getByRole('button', { name: 'Inspect address', exact: true }).click();
  await expect(page.getByText('Gross refundable COOK', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm and request Nightly approval' })).toHaveCount(0);
  await expect(page.getByText('3000000000 base units', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review reclaim' })).toBeEnabled();
  expect(await page.locator('html').getAttribute('data-sign-calls')).toBeNull();
});

test('Nightly refuses to sign when reconnecting changes the active address', async ({ page }) => {
  await mockRpc(page); await mockNightly(page, false, true); await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await page.getByRole('button', { name: 'Review reclaim' }).click();
  await page.getByRole('button', { name: 'Confirm and request Nightly approval' }).click();
  await expect(page.getByRole('region', { name: 'Connected wallet' })).toContainText(NEXT);
  expect(await page.locator('html').getAttribute('data-sign-calls')).toBeNull();
});

test('Wallet Standard retains signing for an advertised custom chain', async ({ page }) => {
  await mockRpc(page); await mockNightly(page); await mockStandard(page, true); await page.goto('/');
  await page.getByRole('button', { name: 'Connect Nightly' }).click();
  await page.getByRole('button', { name: 'Review reclaim' }).click();
  expect(await page.locator('html').getAttribute('data-standard-sign-chain')).toBeNull();
  await page.getByRole('button', { name: 'Confirm and request Nightly approval' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-standard-sign-chain', 'solana:' + GENESIS.slice(0, 32));
  expect(await page.locator('html').getAttribute('data-network-request')).toBeNull();
  expect(await page.locator('html').getAttribute('data-sign-calls')).toBeNull();
});
