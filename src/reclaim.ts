import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import type { RpcPort } from '../integrations/rpc';
import type { WalletPort, WalletSnapshot } from '../integrations/nightly';
import { publicAddress, transactionSignature } from '../integrations/explorer';
import { array, base64, closeTransaction, ineligible, integer, nativeBalance, readRaw, record, safeNumber, text, verifyNetwork, type RawAccount, type VerifiedNetwork } from './domain';

export type Phase = 'idle' | 'validating' | 'simulating' | 'ready' | 'awaiting approval' | 'submitted' | 'confirming' | 'confirmed' | 'finalized' | 'rejected' | 'failed' | 'expired' | 'unknown/pending';
export interface Preview {
  raw: RawAccount; wallet: WalletSnapshot; network: VerifiedNetwork; transaction: Transaction;
  blockhash: string; lastValidBlockHeight: bigint; fee: bigint; gross: bigint; net: bigint;
  message: Uint8Array;
}
export interface Submission {
  signature: string; wallet: string; source: string; mint: string; genesis: string;
  blockhash: string; lastValidBlockHeight: string; createdAt: string;
  status: 'submitted' | 'confirming' | 'confirmed' | 'finalized' | 'failed' | 'unknown/pending';
  slot?: number;
}
export interface ReclaimState { phase: Phase; message: string; preview: Preview | null; submission: Submission | null }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const STORAGE_KEY = 'cookielens.submissions.v1';
class Expired extends Error {}
class Cancelled extends Error {}
function terminal(status: Submission['status']): boolean { return status === 'confirmed' || status === 'finalized' || status === 'failed'; }
function equal(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((byte, index) => byte === b[index]); }
function readSubmissions(storage: StoragePort): Submission[] {
  const saved = storage.getItem(STORAGE_KEY);
  if (saved === null) return [];
  return array(JSON.parse(saved)).map(value => {
    const item = record(value);
    const status = text(item.status);
    if (!['submitted', 'confirming', 'confirmed', 'finalized', 'failed', 'unknown/pending'].includes(status)) throw new Error('Invalid saved status.');
    const createdAt = text(item.createdAt);
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid saved timestamp.');
    return {
      signature: transactionSignature(text(item.signature)), wallet: publicAddress(text(item.wallet)),
      source: publicAddress(text(item.source)), mint: publicAddress(text(item.mint)), genesis: publicAddress(text(item.genesis)),
      blockhash: publicAddress(text(item.blockhash)), lastValidBlockHeight: integer(item.lastValidBlockHeight).toString(),
      createdAt, status: status as Submission['status'], ...(item.slot == null ? {} : { slot: safeNumber(item.slot) }),
    };
  });
}

export class Reclaimer {
  state: ReclaimState = { phase: 'idle', message: 'Select one eligible account to review.', preview: null, submission: null };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  private reconciling = false;
  private storageBlocked = false;
  private submissions: Submission[] = [];
  constructor(private readonly rpc: RpcPort, private readonly wallet: WalletPort, private readonly storage: StoragePort, private readonly expectedGenesis: string) {
    try {
      this.submissions = readSubmissions(storage);
      const pending = this.pending;
      if (pending) this.state = { phase: 'unknown/pending', message: 'A saved submission needs reconciliation before another reclaim.', preview: null, submission: pending };
    } catch {
      this.storageBlocked = true;
      this.state = { phase: 'failed', message: 'Saved submission storage is unavailable or invalid. Reclaim is blocked to avoid losing an unresolved signature.', preview: null, submission: null };
    }
  }
  get pending(): Submission | null { return this.submissions.find(item => !terminal(item.status)) ?? null; }
  get history(): readonly Submission[] { return this.submissions; }
  get busy(): boolean { return this.active || this.reconciling; }
  get canPrepare(): boolean { return !this.busy && !this.pending && !this.state.preview && !this.storageBlocked; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private set(phase: Phase, message: string, preview: Preview | null = this.state.preview, submission: Submission | null = this.state.submission): void {
    this.state = { phase, message, preview, submission };
    for (const listener of this.listeners) listener();
  }
  cancel(): void {
    this.epoch++;
    if (this.pending) this.set('unknown/pending', 'The submitted signature remains pending; reconcile it before another reclaim.', null, this.pending);
    else if (!this.storageBlocked) this.set('idle', 'Selection cancelled. Review a fresh account before signing.', null, null);
  }
  private guard(wallet: WalletSnapshot, epoch: number): void {
    const current = this.wallet.current();
    if (epoch !== this.epoch || !current || current.address !== wallet.address || current.revision !== wallet.revision) throw new Cancelled('Wallet or selection changed. The unsigned action was cancelled.');
  }
  private async fee(transaction: Transaction, minSlot: number): Promise<bigint> {
    const response = record(await this.rpc.call('getFeeForMessage', [base64(transaction.serializeMessage()), { commitment: 'confirmed' }]));
    if (safeNumber(record(response.context).slot) < minSlot) throw new Error('RPC returned a stale fee estimate.');
    if (response.value === null) throw new Error('Network fee estimation is unavailable.');
    return integer(response.value);
  }
  private economics(gross: bigint, fee: bigint, balance: bigint): void {
    if (gross <= fee) throw new Error('Estimated net return must be positive.');
    if (balance < fee) throw new Error('Insufficient existing native COOK to pay the network fee. Refunds cannot fund the upfront fee.');
  }
  async prepare(source: string, inspected: string): Promise<void> {
    if (!this.canPrepare) return;
    const wallet = this.wallet.current();
    if (!wallet || wallet.address !== inspected) { this.set('failed', 'Connect Nightly and inspect your connected wallet to reclaim.', null); return; }
    const epoch = ++this.epoch;
    this.active = true;
    this.set('validating', 'Checking network identity and the selected account.', null, null);
    try {
      const network = await verifyNetwork(this.rpc, this.expectedGenesis);
      this.guard(wallet, epoch);
      const raw = await readRaw(this.rpc, source, network.slot);
      const reason = ineligible(raw.account, wallet.address);
      if (reason) throw new Error(reason);
      this.guard(wallet, epoch);
      const block = record(await this.rpc.call('getLatestBlockhash', [{ commitment: 'confirmed', minContextSlot: raw.slot }]));
      if (safeNumber(record(block.context).slot) < raw.slot) throw new Error('RPC returned a stale blockhash context.');
      const blockValue = record(block.value);
      const blockhash = publicAddress(text(blockValue.blockhash));
      const lastValidBlockHeight = integer(blockValue.lastValidBlockHeight);
      const transaction = closeTransaction(raw.account, wallet.address, blockhash);
      const [fee, balance] = await Promise.all([this.fee(transaction, raw.slot), nativeBalance(this.rpc, wallet.address, raw.slot)]);
      this.economics(raw.account.lamports, fee, balance);
      this.guard(wallet, epoch);
      this.set('simulating', 'Simulating this exact CloseAccount transaction. No wallet approval has been requested.');
      const simulation = record(await this.rpc.call('simulateTransaction', [base64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })), {
        encoding: 'base64', commitment: 'confirmed', sigVerify: false, replaceRecentBlockhash: false, minContextSlot: raw.slot,
      }]));
      if (safeNumber(record(simulation.context).slot) < raw.slot) throw new Error('RPC returned a stale simulation.');
      if (record(simulation.value).err !== null) throw new Error('Simulation failed or omitted its result. Signing is blocked.');
      this.guard(wallet, epoch);
      if (integer(await this.rpc.call('getBlockHeight', [{ commitment: 'confirmed' }])) > lastValidBlockHeight) throw new Expired('Preview expired. Select the account again for a new review.');
      this.guard(wallet, epoch);
      this.set('ready', 'Simulation passed. Review the full account and estimates before requesting Nightly approval.', {
        raw, wallet, network, transaction, blockhash, lastValidBlockHeight,
        fee, gross: raw.account.lamports, net: raw.account.lamports - fee, message: new Uint8Array(transaction.serializeMessage()),
      });
    } catch (error) { this.handle(error, epoch); }
    finally { this.active = false; }
  }
  private async fresh(preview: Preview, epoch: number): Promise<void> {
    this.guard(preview.wallet, epoch);
    const network = await verifyNetwork(this.rpc, this.expectedGenesis);
    const raw = await readRaw(this.rpc, preview.raw.account.address, Math.max(network.slot, preview.raw.slot));
    const reason = ineligible(raw.account, preview.wallet.address);
    if (reason || raw.fingerprint !== preview.raw.fingerprint) throw new Error('Selected account changed. Cancel and review a new preview.');
    const [fee, balance, height] = await Promise.all([
      this.fee(preview.transaction, raw.slot), nativeBalance(this.rpc, preview.wallet.address, raw.slot),
      this.rpc.call('getBlockHeight', [{ commitment: 'confirmed' }]),
    ]);
    if (fee !== preview.fee) throw new Error('Network fee changed. Cancel and review a new preview.');
    this.economics(raw.account.lamports, fee, balance);
    if (integer(height) > preview.lastValidBlockHeight) throw new Expired('Blockhash expired. This transaction will not be broadcast. Review a new preview.');
    if (!equal(preview.transaction.serializeMessage(), preview.message)) throw new Error('Preview transaction changed.');
    this.guard(preview.wallet, epoch);
  }
  async confirm(): Promise<void> {
    if (this.active || this.pending || this.storageBlocked || this.state.phase !== 'ready' || !this.state.preview) return;
    this.active = true;
    const preview = this.state.preview, epoch = this.epoch;
    let signing = false;
    try {
      this.set('validating', 'Rechecking the account, wallet, fee and blockhash before approval.');
      await this.fresh(preview, epoch);
      this.set('awaiting approval', 'Approve only this one account closure in Nightly.');
      signing = true;
      const signedBytes = await this.wallet.sign(Transaction.from(preview.transaction.serialize({ requireAllSignatures: false, verifySignatures: false })), preview.network.genesis);
      signing = false;
      this.guard(preview.wallet, epoch);
      const signed = Transaction.from(signedBytes);
      if (!equal(signed.serializeMessage(), preview.message) || !signed.signature || !signed.verifySignatures()) throw new Error('Nightly returned a changed or invalid signed transaction. Broadcast blocked.');
      await this.fresh(preview, epoch);
      const submission: Submission = {
        signature: bs58.encode(signed.signature), wallet: preview.wallet.address, source: preview.raw.account.address,
        mint: preview.raw.account.mint, genesis: preview.network.genesis,
        blockhash: preview.blockhash, lastValidBlockHeight: preview.lastValidBlockHeight.toString(),
        createdAt: new Date().toISOString(), status: 'submitted',
      };
      const next = [...this.submissions, submission];
      try { this.storage.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch { throw new Error('Cannot retain the signature in browser storage. Nothing was broadcast.'); }
      this.submissions = next;
      this.set('submitted', 'Signature saved. Broadcasting once through verified Cookie Chain RPC.', null, submission);
      try {
        const returned = await this.rpc.call('sendTransaction', [base64(signedBytes), {
          encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0, minContextSlot: preview.raw.slot,
        }]);
        if (returned !== submission.signature) throw new Error('RPC returned an unexpected signature.');
        this.set('confirming', 'Submitted. Waiting for confirmed or finalized chain status.', null, submission);
      } catch {
        this.updateSubmission(submission, 'unknown/pending', 'Broadcast response is unavailable. The transaction may have landed. Reconcile this signature; do not submit a replacement.');
      }
      await this.reconcile();
    } catch (error) {
      if (this.pending) this.set('unknown/pending', 'Submission outcome is unknown. Reconcile the saved signature before another reclaim.', null, this.pending);
      else if (signing && !(error instanceof Cancelled)) this.set('rejected', 'Nightly approval was rejected or interrupted. Nothing was broadcast.', null);
      else this.handle(error, epoch);
    } finally { this.active = false; }
  }
  private handle(error: unknown, epoch: number): void {
    if (epoch !== this.epoch) return;
    this.set(error instanceof Expired ? 'expired' : error instanceof Cancelled ? 'rejected' : 'failed', error instanceof Error ? error.message : 'Reclaim could not continue.', null);
  }
  private updateSubmission(submission: Submission, status: Submission['status'], message: string, slot?: number): void {
    const updated: Submission = { ...submission, status, ...(slot === undefined ? {} : { slot }) };
    const next = this.submissions.map(item => item.signature === submission.signature ? updated : item);
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch {
      this.storageBlocked = true;
      this.set('unknown/pending', 'Submission status could not be retained. Reclaim remains blocked; keep the displayed signature for reconciliation.', null, submission);
      return;
    }
    this.submissions = next;
    this.set(status, message, null, updated);
  }
  async reconcile(): Promise<void> {
    const submission = this.pending;
    if (!submission || this.reconciling) return;
    this.reconciling = true;
    try {
      const network = await verifyNetwork(this.rpc, this.expectedGenesis);
      if (network.genesis !== submission.genesis) throw new Error('Saved submission belongs to another network identity.');
      const response = record(await this.rpc.call('getSignatureStatuses', [[submission.signature], { searchTransactionHistory: true }]));
      const values = array(response.value);
      if (values.length !== 1) throw new Error('Malformed signature status response.');
      if (values[0] !== null) {
        const status = record(values[0]);
        const finality = status.confirmationStatus;
        if (finality === 'confirmed' || finality === 'finalized') {
          if (!Object.hasOwn(status, 'err')) throw new Error('Transaction error status is unavailable.');
          const slot = safeNumber(status.slot);
          if (status.err !== null) this.updateSubmission(submission, 'failed', `Chain reported a transaction error at ${finality} commitment.`, slot);
          else this.updateSubmission(submission, finality, `Account closure ${finality}; chain transaction error is null. Refresh balances and inventory.`, slot);
          return;
        }
        this.updateSubmission(submission, 'confirming', 'Transaction observed but not confirmed. A replacement remains blocked.');
        return;
      }
      const height = integer(await this.rpc.call('getBlockHeight', [{ commitment: 'confirmed' }]));
      if (height > integer(submission.lastValidBlockHeight)) {
        const transaction = await this.rpc.call('getTransaction', [submission.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
        if (transaction !== null) {
          const tx = record(transaction), meta = record(tx.meta);
          if (!Object.hasOwn(meta, 'err')) throw new Error('Transaction metadata omitted its error.');
          this.updateSubmission(submission, meta.err === null ? 'confirmed' : 'failed', meta.err === null ? 'Transaction confirmed with null error in transaction metadata.' : 'Confirmed transaction contains a chain error.', safeNumber(tx.slot));
        } else {
          this.updateSubmission(submission, 'unknown/pending', 'Blockhash validity has expired, but absence from this RPC does not prove non-inclusion. Outcome remains unknown; a replacement is blocked.');
        }
      } else this.updateSubmission(submission, 'unknown/pending', 'Signature is not yet visible. It may still land. Reconcile again shortly.');
    } catch {
      this.updateSubmission(submission, 'unknown/pending', 'RPC or network verification is unavailable. The saved signature remains unresolved; no replacement is allowed.');
    } finally { this.reconciling = false; }
  }
}
