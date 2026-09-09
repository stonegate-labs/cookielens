import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import type { RpcPort } from '../integrations/rpc';
import { publicAddress } from '../integrations/explorer';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const COOK_DECIMALS = 9;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RPC returned a malformed object.');
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('RPC returned a malformed list.');
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('RPC returned a malformed string.');
  return value;
}
export function integer(value: unknown): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new Error('RPC returned an invalid or imprecise base-unit integer.');
}
export function safeNumber(value: unknown): number {
  const result = integer(value);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('RPC integer exceeds supported index range.');
  return Number(result);
}
export function units(value: bigint, decimals = COOK_DECIMALS): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Unsupported token decimals.');
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(decimals + 1, '0');
  if (!decimals) return sign + digits;
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return sign + whole + (fraction ? `.${fraction}` : '');
}
export function base64(bytes: Uint8Array): string { return Buffer.from(bytes).toString('base64'); }
export interface TokenAccount {
  address: string; program: string; owner: string; mint: string;
  amount: bigint; lamports: bigint; decimals: number;
  state: 'initialized' | 'frozen' | 'uninitialized' | 'unsupported';
  native: boolean; delegate: string | null; closeAuthority: string | null;
}
export function ineligible(account: TokenAccount, wallet: string): string | null {
  if (account.program !== TOKEN_PROGRAM) return 'Unsupported token program';
  if (account.owner !== wallet) return 'Token owner is another wallet';
  if (account.amount !== 0n) return 'Contains tokens';
  if (account.state !== 'initialized') return `${account.state} account`;
  if (account.native) return 'Wrapped-native account';
  if (account.delegate !== null) return 'Delegate is set';
  if ((account.closeAuthority ?? account.owner) !== wallet) return 'Close authority is another wallet';
  return null;
}
export function parsedToken(value: unknown): TokenAccount {
  const row = record(value), account = record(row.account);
  const data = record(account.data), info = record(record(data.parsed).info);
  const amount = record(info.tokenAmount);
  if (typeof info.isNative !== 'boolean') throw new Error('Token native state is unavailable.');
  const decimals = safeNumber(amount.decimals);
  if (decimals > 255) throw new Error('Unsupported token decimals.');
  const state = info.state === 'initialized' || info.state === 'frozen' || info.state === 'uninitialized' ? info.state : 'unsupported';
  return {
    address: publicAddress(text(row.pubkey)), program: publicAddress(text(account.owner)),
    owner: publicAddress(text(info.owner)), mint: publicAddress(text(info.mint)),
    amount: integer(amount.amount), lamports: integer(account.lamports), decimals, state,
    native: info.isNative,
    delegate: info.delegate == null ? null : publicAddress(text(info.delegate)),
    closeAuthority: info.closeAuthority == null ? null : publicAddress(text(info.closeAuthority)),
  };
}
export interface RawAccount { account: TokenAccount; fingerprint: string; slot: number }
export async function readRaw(rpc: RpcPort, address: string, minSlot = 0): Promise<RawAccount> {
  publicAddress(address);
  const result = record(await rpc.call('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed', minContextSlot: minSlot }]));
  const slot = safeNumber(record(result.context).slot);
  if (slot < minSlot) throw new Error('RPC returned a stale account context.');
  if (result.value === null) throw new Error('Token account disappeared or was already closed.');
  const value = record(result.value);
  if (value.executable !== false) throw new Error('Unsupported executable token account.');
  const encoded = array(value.data);
  if (encoded[1] !== 'base64') throw new Error('Unsupported token account encoding.');
  const wire = text(encoded[0]);
  const bytes = Buffer.from(wire, 'base64');
  if (bytes.length !== 165 || bytes.toString('base64') !== wire) throw new Error('Unsupported account layout; only legacy single-owner token accounts are supported.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const key = (offset: number) => new PublicKey(bytes.subarray(offset, offset + 32)).toBase58();
  const option = (offset: number): number => {
    const tag = view.getUint32(offset, true);
    if (tag !== 0 && tag !== 1) throw new Error('Unsupported token account option.');
    return tag;
  };
  const delegate = option(72) ? key(76) : null;
  const native = option(109) === 1;
  const closeAuthority = option(129) ? key(133) : null;
  const state = bytes[108] === 1 ? 'initialized' : bytes[108] === 2 ? 'frozen' : bytes[108] === 0 ? 'uninitialized' : 'unsupported';
  const lamports = integer(value.lamports), program = publicAddress(text(value.owner));
  return {
    slot, fingerprint: JSON.stringify([program, wire, lamports.toString()]),
    account: { address, program, owner: key(32), mint: key(0), amount: view.getBigUint64(64, true),
      lamports, decimals: 0, state, native, delegate, closeAuthority },
  };
}
export interface VerifiedNetwork { genesis: string; program: string; slot: number; checkedAt: string }
export async function verifyNetwork(rpc: RpcPort, expected: string): Promise<VerifiedNetwork> {
  if (!expected) throw new Error('Reclaim is disabled until Cookie Chain genesis identity is independently verified and configured.');
  publicAddress(expected);
  const genesis = text(await rpc.call('getGenesisHash'));
  if (genesis !== expected) throw new Error('Cookie Chain genesis identity mismatch. Reclaim is blocked.');
  const response = record(await rpc.call('getAccountInfo', [TOKEN_PROGRAM, { encoding: 'base64', commitment: 'confirmed' }]));
  if (response.value === null || record(response.value).executable !== true) throw new Error('Canonical legacy SPL Token program is not executable on this network.');
  return { genesis, program: TOKEN_PROGRAM, slot: safeNumber(record(response.context).slot), checkedAt: new Date().toISOString() };
}
export function closeTransaction(account: TokenAccount, wallet: string, blockhash: string): Transaction {
  const reason = ineligible(account, wallet);
  if (reason) throw new Error(reason);
  const owner = new PublicKey(publicAddress(wallet));
  const tx = new Transaction({ feePayer: owner, recentBlockhash: publicAddress(blockhash) });
  tx.add(new TransactionInstruction({
    programId: new PublicKey(TOKEN_PROGRAM),
    keys: [
      { pubkey: new PublicKey(account.address), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([9]),
  }));
  return tx;
}
export async function nativeBalance(rpc: RpcPort, address: string, minSlot = 0): Promise<bigint> {
  const response = record(await rpc.call('getBalance', [address, { commitment: 'confirmed', minContextSlot: minSlot }]));
  if (safeNumber(record(response.context).slot) < minSlot) throw new Error('RPC returned a stale balance context.');
  return integer(response.value);
}
