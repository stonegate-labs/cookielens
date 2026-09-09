import bs58 from 'bs58';
import type { RpcPort } from '../integrations/rpc';
import { publicAddress, transactionSignature } from '../integrations/explorer';
import { TOKEN_PROGRAM, array, integer, parsedToken, record, safeNumber, text, type TokenAccount } from './domain';

export interface SignatureRow {
  signature: string; slot: number; time: number | null; failed: boolean; finality: string;
}
export interface TransactionDetail {
  fee: bigint; feePayer: string; delta: bigint | null; actions: string[]; failed: boolean;
}
export interface Activity extends SignatureRow { detail: TransactionDetail | null; unavailable: string | null }
export interface Overview {
  address: string; balance: bigint; accounts: TokenAccount[]; activity: Activity[];
  genesis: string; slot: number; oldestSlot: number; updatedAt: string;
}
export function signatures(value: unknown): SignatureRow[] {
  const seen = new Set<string>();
  return array(value).slice(0, 50).map(item => {
    const row = record(item);
    if (!Object.hasOwn(row, 'err')) throw new Error('RPC omitted transaction status.');
    return {
      signature: transactionSignature(text(row.signature)), slot: safeNumber(row.slot),
      time: row.blockTime == null ? null : safeNumber(row.blockTime), failed: row.err !== null,
      finality: row.confirmationStatus === 'finalized' || row.confirmationStatus === 'confirmed' ? row.confirmationStatus : 'unavailable',
    };
  }).sort((a, b) => b.slot - a.slot).filter(row => {
    if (seen.has(row.signature)) return false;
    seen.add(row.signature); return true;
  });
}
export async function boundedMap<T, U>(items: T[], worker: (item: T) => Promise<U>): Promise<U[]> {
  const result = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index]);
    }
  }));
  return result;
}
export function transactionDetail(value: unknown, wallet: string): TransactionDetail | null {
  if (value === null) return null;
  const response = record(value);
  if (response.meta === null) return null;
  const meta = record(response.meta), message = record(record(response.transaction).message);
  const keys = array(message.accountKeys).map(key => publicAddress(typeof key === 'string' ? key : text(record(key).pubkey)));
  if (meta.loadedAddresses) {
    const loaded = record(meta.loadedAddresses);
    for (const key of [...array(loaded.writable), ...array(loaded.readonly)]) keys.push(publicAddress(text(key)));
  }
  if (!keys.length || !Object.hasOwn(meta, 'err')) throw new Error('Transaction metadata is unavailable.');
  const pre = array(meta.preBalances), post = array(meta.postBalances);
  const index = keys.indexOf(wallet);
  const delta = index < 0 || pre[index] == null || post[index] == null ? null : integer(post[index]) - integer(pre[index]);
  const actions = array(message.instructions).map(value => {
    try {
      const instruction = record(value);
      const program = keys[safeNumber(instruction.programIdIndex)];
      const bytes = bs58.decode(text(instruction.data));
      if (program === TOKEN_PROGRAM && bytes.length === 1 && bytes[0] === 9) return 'Close token account';
      if (program === TOKEN_PROGRAM && ((bytes[0] === 3 && bytes.length === 9) || (bytes[0] === 12 && bytes.length === 10))) return 'Token transfer';
      if (program === '11111111111111111111111111111111' && bytes.length === 12 && bytes[0] === 2 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0) return 'Native transfer';
    } catch {}
    return 'Unknown instruction';
  });
  return { fee: integer(meta.fee), feePayer: keys[0], delta, failed: meta.err !== null, actions: [...new Set(actions.length ? actions : ['Unknown instruction'])] };
}
export async function loadOverview(rpc: RpcPort, input: string, signal?: AbortSignal): Promise<Overview> {
  const address = publicAddress(input);
  const [balanceValue, accountsValue, signatureValue, genesisValue] = await Promise.all([
    rpc.call('getBalance', [address, { commitment: 'confirmed' }], signal),
    rpc.call('getTokenAccountsByOwner', [address, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed', commitment: 'confirmed' }], signal),
    rpc.call('getSignaturesForAddress', [address, { limit: 50, commitment: 'confirmed' }], signal),
    rpc.call('getGenesisHash', [], signal),
  ]);
  const balance = record(balanceValue), inventory = record(accountsValue);
  const slots = [safeNumber(record(balance.context).slot), safeNumber(record(inventory.context).slot)];
  const rows = signatures(signatureValue);
  const activity = await boundedMap(rows, async row => {
    try {
      const detail = transactionDetail(await rpc.call('getTransaction', [row.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }], signal), address);
      return { ...row, detail, unavailable: detail ? null : 'Detail unavailable or pruned' };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ...row, detail: null, unavailable: 'Detail unavailable: RPC error or unsupported transaction' };
    }
  });
  return {
    address, balance: integer(balance.value), accounts: array(inventory.value).map(parsedToken), activity,
    genesis: publicAddress(text(genesisValue)), slot: Math.max(...slots), oldestSlot: Math.min(...slots), updatedAt: new Date().toISOString(),
  };
}
export function summarize(activity: Activity[], wallet: string, now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 7 }, (_, index) => ({ date: new Date(today - (6 - index) * 86400000).toISOString().slice(0, 10), count: 0 }));
  let fees = 0n, available = 0, unknownTimes = 0;
  for (const row of activity) {
    if (row.detail) { available++; if (row.detail.feePayer === wallet) fees += row.detail.fee; }
    if (row.time === null) { unknownTimes++; continue; }
    const date = new Date(row.time * 1000).toISOString().slice(0, 10);
    const day = days.find(item => item.date === date);
    if (day) day.count++;
  }
  const times = activity.flatMap(row => row.time === null ? [] : [row.time]);
  return {
    days, fees, available, unavailable: activity.length - available, unknownTimes,
    successful: activity.filter(row => !row.failed).length, failed: activity.filter(row => row.failed).length,
    from: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
    to: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
    atLimit: activity.length === 50,
  };
}
