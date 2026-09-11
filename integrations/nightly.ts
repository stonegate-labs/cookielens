import { getWallets } from '@wallet-standard/app';
import { Transaction } from '@solana/web3.js';
import { publicAddress } from './explorer';

export interface WalletSnapshot { address: string; revision: number }
export interface WalletPort {
  current(): WalletSnapshot | null;
  sign(transaction: Transaction, genesis: string): Promise<Uint8Array>;
}
type ObjectLike = Record<string, unknown>;
function object(value: unknown): ObjectLike {
  return value && (typeof value === 'object' || typeof value === 'function') ? value as ObjectLike : {};
}
function callable(value: unknown): value is (...args: unknown[]) => unknown { return typeof value === 'function'; }
async function invoke(target: unknown, name: string, ...args: unknown[]): Promise<unknown> {
  const value = object(target)[name];
  if (!callable(value)) throw new Error(`Nightly does not expose the required ${name} interface.`);
  return value.apply(target, args);
}
function addressOf(value: unknown): string | null {
  if (typeof value === 'string') return publicAddress(value);
  const item = object(value);
  if (typeof item.address === 'string') return publicAddress(item.address);
  if (item.publicKey) return addressOf(item.publicKey);
  if (callable(item.toBase58)) return publicAddress(String(item.toBase58.apply(value, [])));
  return null;
}

const COOKIE_RPC = 'https://rpc.cookiescan.io';
function providerAddress(provider: ObjectLike): string | null {
  if (provider.isConnected === false) return null;
  const accounts = provider.accounts;
  const address = (Array.isArray(accounts) ? addressOf(accounts[0]) : null) ?? addressOf(provider.publicKey);
  return address === '11111111111111111111111111111111' ? null : address;
}

export class NightlyWallet implements WalletPort {
  private connected: WalletSnapshot | null = null;
  private revision = 0;
  private listeners = new Set<() => void>();
  private provider: ObjectLike | null = null;
  private standard: ObjectLike | null = null;
  private account: unknown;
  private cleanup: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private connecting = false;
  private switching = false;
  private standards(): ObjectLike[] {
    return getWallets().get().filter(wallet => wallet.name.toLowerCase() === 'nightly').map(wallet => object(wallet));
  }
  private injected(): ObjectLike {
    return object(object(object(globalThis).nightly).solana);
  }
  available(): boolean { return this.standards().length > 0 || Object.keys(this.injected()).length > 0; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(address: string | null): void {
    if (address === this.connected?.address || (!address && !this.connected)) return;
    this.revision++;
    this.connected = address ? { address, revision: this.revision } : null;
    for (const listener of this.listeners) listener();
  }
  current(): WalletSnapshot | null {
    if (this.provider && this.connected) {
      try { const address = providerAddress(this.provider); if (address || !this.switching) this.update(address); }
      catch { this.update(null); }
    }
    return this.connected ? { ...this.connected } : null;
  }
  async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      this.release();
      this.update(null);
      const standards = this.standards();
      const supported = standards.find(wallet => {
        const features = object(wallet.features);
        return callable(object(features['standard:connect']).connect)
          && callable(object(features['standard:events']).on)
          && callable(object(features['standard:disconnect']).disconnect)
          && callable(object(features['solana:signTransaction']).signTransaction);
      });
      if (supported) {
        const features = object(supported.features);
        const result = object(await invoke(features['standard:connect'], 'connect'));
        this.standard = supported;
        const accounts = result.accounts;
        this.account = Array.isArray(accounts) ? accounts[0] : undefined;
        const selectedAddress = addressOf(this.account);
        if (!selectedAddress) throw new Error('Nightly did not return a public account.');
        const stop = await invoke(features['standard:events'], 'on', 'change', (change: unknown) => {
          const next = object(change).accounts;
          if (Array.isArray(next)) {
            this.account = next[0];
            try { this.update(addressOf(this.account)); } catch { this.update(null); }
          }
        });
        if (callable(stop)) this.cleanup = () => { stop(); };
        this.update(selectedAddress);
        return;
      }
      await this.connectInjected();
    } catch (error) {
      this.release(); this.update(null);
      throw error instanceof Error ? error : new Error('Nightly connection was rejected or unavailable.');
    } finally { this.connecting = false; }
  }
  private async connectInjected(): Promise<void> {
    const provider = this.injected();
    if (!Object.keys(provider).length) throw new Error('Nightly is not installed. Install Nightly, configure Cookie Chain, then reload.');
    if (!callable(provider.connect) || !callable(provider.disconnect) || !callable(provider.signTransaction)
        || (!callable(provider.on) && !('accounts' in provider) && !('publicKey' in provider))) {
      throw new Error('Installed Nightly cannot provide signing and account-change detection. Update Nightly and retry.');
    }
    await invoke(provider, 'connect');
    this.provider = provider;
    const selectedAddress = providerAddress(provider);
    if (!selectedAddress) throw new Error('Nightly did not return a public account.');
    if (callable(provider.on)) {
      const changed = (key: unknown) => {
        try {
          const address = key === null ? null : providerAddress(provider);
          if (address || !this.switching) this.update(address);
        }
        catch { this.update(null); }
      };
      const disconnected = () => { if (!this.switching) this.update(null); };
      await invoke(provider, 'on', 'accountChanged', changed);
      await invoke(provider, 'on', 'disconnect', disconnected);
      this.cleanup = () => {
        if (callable(provider.removeListener)) {
          provider.removeListener.apply(provider, ['accountChanged', changed]);
          provider.removeListener.apply(provider, ['disconnect', disconnected]);
        }
      };
    }
    this.update(selectedAddress);
    this.poll = setInterval(() => { this.current(); }, 500);
  }
  private release(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.cleanup?.(); this.cleanup = null;
    this.provider = null; this.standard = null; this.account = undefined;
  }
  async disconnect(): Promise<void> {
    const target = this.standard ? object(this.standard.features)['standard:disconnect'] : this.provider;
    this.release(); this.update(null);
    if (target) await invoke(target, 'disconnect');
  }
  async sign(transaction: Transaction, genesis: string): Promise<Uint8Array> {
    const current = this.current();
    if (!current) throw new Error('Nightly disconnected.');
    if (this.standard) {
      const chain = `solana:${genesis.slice(0, 32)}`;
      const account = object(this.account);
      if (!Array.isArray(account.chains) || !account.chains.includes(chain)
          || !Array.isArray(account.features) || !account.features.includes('solana:signTransaction')) {
        this.release();
        try { await this.connectInjected(); }
        catch (error) { this.release(); this.update(null); throw error; }
      } else {
        const feature = object(this.standard.features)['solana:signTransaction'];
        const output = await invoke(feature, 'signTransaction', {
          account: this.account, chain,
          transaction: new Uint8Array(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })),
        });
        const signed = Array.isArray(output) ? object(output[0]).signedTransaction : undefined;
        if (!(signed instanceof Uint8Array)) throw new Error('Nightly returned an unsupported signed transaction.');
        return signed;
      }
    }
    if (!this.provider) throw new Error('Nightly signing interface unavailable.');
    const provider = this.provider;
    const validate = () => {
      const active = this.current();
      if (this.provider !== provider || !active || active.address !== current.address || active.revision !== current.revision) {
        throw new Error('Nightly active account changed. Review the transaction again.');
      }
    };
    validate();
    if (object(provider.chainInfo).provider !== COOKIE_RPC) {
      this.switching = true;
      try {
        await invoke(provider, 'changeNetwork', { url: COOKIE_RPC });
        // Nightly can temporarily clear its account while loading the network.
        if (!providerAddress(provider)) await invoke(provider, 'connect');
      } finally {
        this.switching = false;
        this.current();
      }
    }
    validate();
    if (object(provider.chainInfo).provider !== COOKIE_RPC) throw new Error('Nightly did not switch to the Cookie RPC.');
    const result = await invoke(provider, 'signTransaction', transaction);
    validate();
    if (result instanceof Transaction) return new Uint8Array(result.serialize());
    const signed = await invoke(result, 'serialize');
    if (!(signed instanceof Uint8Array)) throw new Error('Nightly returned an unsupported signed transaction.');
    return signed;
  }
}
