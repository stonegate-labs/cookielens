import { describe, expect, it } from 'vitest';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { explorer, publicAddress } from '../integrations/explorer';
import { TOKEN_2022, TOKEN_PROGRAM, closeTransaction, ineligible, integer, parsedToken, readRaw, units, verifyNetwork } from '../src/domain';
import { boundedMap, loadOverview, signatures, summarize, transactionDetail, type Activity } from '../src/analytics';
import { FixtureRpc, GENESIS, MINT, OTHER, SOURCE, parsedValue, token } from './fixtures';

const owner = OTHER;
const signature = (value: number) => bs58.encode(new Uint8Array(64).fill(value));
function activity(time: number | null, overrides: Partial<Activity> = {}): Activity {
  return { signature: signature(1), slot: 1, time, failed: false, finality: 'confirmed', detail: null, unavailable: 'pruned', ...overrides };
}
describe('precision and address boundaries', () => {
  it('preserves integer amounts beyond the safe integer range', () => {
    expect(units(integer('9007199254740993123'))).toBe('9007199254.740993123');
    expect(units(-1n)).toBe('-0.000000001');
    expect(units(1n, 6)).toBe('0.000001');
    expect(() => integer(9007199254740992)).toThrow();
    expect(() => integer('1.2')).toThrow();
  });
  it('rejects invalid keys and executable URL schemes', () => {
    for (const input of ['javascript:alert(1)', 'https://example.org', '<script>', 'abc']) expect(() => publicAddress(input)).toThrow();
    expect(explorer('account', SOURCE)).toBe(`https://cookiescan.io/account/${SOURCE}`);
    expect(() => explorer('tx', 'data:text/html,boom')).toThrow();
  });
  it('ignores untrusted token metadata instead of rendering or executing it', () => {
    const value = parsedValue(token(owner));
    Object.assign(value.account.data.parsed.info, { name: '<img src=x onerror=alert(1)>', uri: 'javascript:alert(1)' });
    const parsed = parsedToken(value);
    expect(parsed).not.toHaveProperty('name');
    expect(parsed).not.toHaveProperty('uri');
    expect(parsed.mint).toBe(MINT);
  });
});
describe('conservative legacy eligibility', () => {
  it.each([
    { amount: 1n }, { program: OTHER }, { program: TOKEN_2022 }, { owner: SOURCE },
    { closeAuthority: SOURCE }, { delegate: SOURCE }, { state: 'frozen' as const },
    { state: 'uninitialized' as const }, { native: true },
  ])('rejects unsupported state case %#', patch => expect(ineligible(token(owner, patch), owner)).not.toBeNull());
  it('accepts only the connected effective authority', () => {
    expect(ineligible(token(owner), owner)).toBeNull();
    expect(ineligible(token(owner, { closeAuthority: owner }), owner)).toBeNull();
  });
  it('deserializes to exactly one canonical CloseAccount with wallet destination and signer', () => {
    const built = closeTransaction(token(owner), owner, GENESIS);
    const decoded = Transaction.from(built.serialize({ requireAllSignatures: false, verifySignatures: false }));
    expect(decoded.instructions).toHaveLength(1);
    const instruction = decoded.instructions[0];
    expect(instruction.programId.toBase58()).toBe(TOKEN_PROGRAM);
    expect([...instruction.data]).toEqual([9]);
    expect(instruction.keys.map(key => key.pubkey.toBase58())).toEqual([SOURCE, owner, owner]);
    expect(instruction.keys[0].isWritable).toBe(true);
    expect(instruction.keys[0].isSigner).toBe(false);
    expect(instruction.keys[1].isWritable).toBe(true);
    expect(instruction.keys[2].isSigner).toBe(true);
    expect(decoded.feePayer?.toBase58()).toBe(owner);
    expect(decoded.signatures).toHaveLength(1);
  });
  it('reads binary state and rejects stale or disappeared accounts', async () => {
    const rpc = new FixtureRpc(owner);
    expect((await readRaw(rpc, SOURCE)).account.amount).toBe(0n);
    await expect(readRaw(rpc, SOURCE, 11)).rejects.toThrow('stale');
    rpc.account = null;
    await expect(readRaw(rpc, SOURCE)).rejects.toThrow('disappeared');
  });
  it('requires a configured matching genesis and executable canonical program', async () => {
    const rpc = new FixtureRpc(owner);
    await expect(verifyNetwork(rpc, '')).rejects.toThrow('disabled');
    await expect(verifyNetwork(rpc, OTHER)).rejects.toThrow('mismatch');
    rpc.executable = false;
    await expect(verifyNetwork(rpc, GENESIS)).rejects.toThrow('executable');
    rpc.executable = true;
    expect((await verifyNetwork(rpc, GENESIS)).program).toBe(TOKEN_PROGRAM);
  });
});
describe('bounded sampled analytics', () => {
  it('deduplicates and orders no more than the newest 50 returned signatures', () => {
    const input = Array.from({ length: 55 }, (_, index) => ({ signature: signature(index + 1), slot: index, blockTime: null, err: null, confirmationStatus: 'confirmed' }));
    input[1] = { ...input[0], slot: 100 };
    const rows = signatures(input);
    expect(rows).toHaveLength(49);
    expect(rows[0].slot).toBe(100);
    expect(new Set(rows.map(row => row.signature)).size).toBe(49);
  });
  it('never has more than four concurrent details and preserves input order', async () => {
    let active = 0, maximum = 0;
    const result = await boundedMap(Array.from({ length: 50 }, (_, index) => index), async index => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--; return index * 2;
    });
    expect(maximum).toBe(4);
    expect(result).toEqual(Array.from({ length: 50 }, (_, index) => index * 2));
  });
  it('uses seven UTC days, counts failures, and distinguishes missing data from zero', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const rows = [
      activity(Date.parse('2026-09-02T00:00:00Z') / 1000, { detail: { fee: 9007199254740993n, feePayer: owner, delta: 0n, actions: ['Unknown instruction'], failed: false } }),
      activity(Date.parse('2026-09-01T23:59:59Z') / 1000, { failed: true, detail: { fee: 5n, feePayer: SOURCE, delta: null, actions: [], failed: true } }),
      activity(Date.parse('2026-09-08T23:59:59Z') / 1000),
      activity(null),
    ];
    const result = summarize(rows, owner, now);
    expect(result.days.map(day => day.count)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(result.fees).toBe(9007199254740993n);
    expect(result.available).toBe(2);
    expect(result.unavailable).toBe(2);
    expect(result.unknownTimes).toBe(1);
    expect(result.failed).toBe(1);
    expect(summarize([], owner, now).fees).toBe(0n);
    expect(summarize([activity(null)], owner, now).available).toBe(0);
  });
  it('handles versioned loaded addresses, unknown instructions, and large deltas', () => {
    const detail = transactionDetail({ transaction: { message: { accountKeys: [SOURCE], instructions: [{ programIdIndex: 9, data: '2' }] } }, meta: {
      fee: '5000', err: null, loadedAddresses: { writable: [owner], readonly: [] },
      preBalances: ['1', '9007199254740993123'], postBalances: ['1', '9007199254740993124'],
    } }, owner);
    expect(detail?.delta).toBe(1n);
    expect(detail?.feePayer).toBe(SOURCE);
    expect(detail?.actions).toEqual(['Unknown instruction']);
    expect(transactionDetail(null, owner)).toBeNull();
  });
  it('validates an inspection before RPC and limits detail requests to deduplicated signatures', async () => {
    const rpc = new FixtureRpc(owner);
    await expect(loadOverview(rpc, 'invalid')).rejects.toThrow();
    expect(rpc.calls).toHaveLength(0);
    rpc.signatures = [{ signature: signature(1), slot: 1, blockTime: null, err: null }, { signature: signature(1), slot: 1, blockTime: null, err: null }];
    const result = await loadOverview(rpc, owner);
    expect(result.activity).toHaveLength(1);
    expect(result.activity[0].detail).toBeNull();
    expect(rpc.calls.filter(call => call.method === 'getTransaction')).toHaveLength(1);
    expect(rpc.calls.find(call => call.method === 'getSignaturesForAddress')?.params[1]).toEqual({ limit: 50, commitment: 'confirmed' });
  });
});
