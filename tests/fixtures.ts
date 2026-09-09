import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import type { RpcPort } from '../integrations/rpc';
import type { WalletPort, WalletSnapshot } from '../integrations/nightly';
import { TOKEN_PROGRAM, base64, type TokenAccount } from '../src/domain';
import type { StoragePort } from '../src/reclaim';

export const FIXTURE_MARKER = 'COOKIE_LENS_TEST_FIXTURE';
export const GENESIS = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
export const SOURCE = new PublicKey(new Uint8Array(32).fill(2)).toBase58();
export const MINT = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
export const OTHER = new PublicKey(new Uint8Array(32).fill(4)).toBase58();
export function token(owner: string, patch: Partial<TokenAccount> = {}): TokenAccount {
  return { address: SOURCE, program: TOKEN_PROGRAM, owner, mint: MINT, amount: 0n, lamports: 2039280n,
    decimals: 6, state: 'initialized', native: false, delegate: null, closeAuthority: null, ...patch };
}
export function rawBytes(account: TokenAccount): Uint8Array {
  const bytes = new Uint8Array(165), view = new DataView(bytes.buffer);
  bytes.set(new PublicKey(account.mint).toBytes(), 0);
  bytes.set(new PublicKey(account.owner).toBytes(), 32);
  view.setBigUint64(64, account.amount, true);
  bytes[108] = account.state === 'initialized' ? 1 : account.state === 'frozen' ? 2 : 0;
  if (account.delegate) { view.setUint32(72, 1, true); bytes.set(new PublicKey(account.delegate).toBytes(), 76); }
  if (account.native) view.setUint32(109, 1, true);
  if (account.closeAuthority) { view.setUint32(129, 1, true); bytes.set(new PublicKey(account.closeAuthority).toBytes(), 133); }
  return bytes;
}
export function rawValue(account: TokenAccount) {
  return { owner: account.program, executable: false, lamports: account.lamports.toString(), data: [base64(rawBytes(account)), 'base64'] };
}
export function parsedValue(account: TokenAccount) {
  return { pubkey: account.address, account: { owner: account.program, lamports: account.lamports.toString(), data: { parsed: { info: {
    mint: account.mint, owner: account.owner, state: account.state, isNative: account.native,
    ...(account.delegate ? { delegate: account.delegate } : {}), ...(account.closeAuthority ? { closeAuthority: account.closeAuthority } : {}),
    tokenAmount: { amount: account.amount.toString(), decimals: account.decimals, uiAmount: null },
  } } } } };
}
export class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
export class FixtureWallet implements WalletPort {
  readonly key = Keypair.generate();
  snapshot: WalletSnapshot | null = { address: this.key.publicKey.toBase58(), revision: 1 };
  signCalls = 0;
  beforeReturn: (() => void | Promise<void>) | null = null;
  reject = false;
  mutate = false;
  current(): WalletSnapshot | null { return this.snapshot ? { ...this.snapshot } : null; }
  async sign(transaction: Transaction): Promise<Uint8Array> {
    this.signCalls++;
    if (this.reject) throw new Error('Approval rejected');
    if (this.mutate) transaction.recentBlockhash = OTHER;
    transaction.sign(this.key);
    await this.beforeReturn?.();
    return new Uint8Array(transaction.serialize());
  }
}
export class FixtureRpc implements RpcPort {
  calls: { method: string; params: unknown[] }[] = [];
  account: TokenAccount | null;
  genesis = GENESIS;
  executable = true;
  slot = 10;
  fee: bigint | null = 5000n;
  balance = 1000000n;
  simulationError: unknown = null;
  height = 20n;
  lastValid = 100n;
  sendError = false;
  statusError = false;
  status: unknown = { slot: 20, confirmationStatus: 'confirmed', err: null };
  transaction: unknown = null;
  sendCount = 0;
  signatures: unknown[] = [];
  constructor(owner: string) { this.account = token(owner); }
  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    this.calls.push({ method, params });
    const context = { slot: this.slot };
    let result: unknown;
    switch (method) {
      case 'getGenesisHash': result = this.genesis; break;
      case 'getAccountInfo': result = { context, value: params[0] === TOKEN_PROGRAM ? { executable: this.executable } : this.account ? rawValue(this.account) : null }; break;
      case 'getBalance': result = { context, value: this.balance.toString() }; break;
      case 'getLatestBlockhash': result = { context, value: { blockhash: GENESIS, lastValidBlockHeight: this.lastValid.toString() } }; break;
      case 'getFeeForMessage': result = { context, value: this.fee?.toString() ?? null }; break;
      case 'simulateTransaction': result = { context, value: { err: this.simulationError } }; break;
      case 'getBlockHeight': result = this.height.toString(); break;
      case 'sendTransaction': {
        this.sendCount++;
        if (this.sendError) throw new Error('RPC timeout');
        const tx = Transaction.from(Buffer.from(String(params[0]), 'base64'));
        if (!tx.signature) throw new Error('Unsigned fixture transaction');
        result = bs58.encode(tx.signature); break;
      }
      case 'getSignatureStatuses': if (this.statusError) throw new Error('RPC 429'); result = { context, value: [this.status] }; break;
      case 'getTransaction': result = this.transaction; break;
      case 'getSignaturesForAddress': result = this.signatures; break;
      case 'getTokenAccountsByOwner': result = { context, value: this.account ? [parsedValue(this.account)] : [] }; break;
      default: throw new Error(`Unexpected fixture RPC method: ${method}`);
    }
    return result as T;
  }
}
