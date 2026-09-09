import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

export function publicAddress(value: string): string {
  const text = value.trim();
  const key = new PublicKey(text);
  if (key.toBytes().length !== 32 || key.toBase58() !== text) throw new Error('Enter a canonical 32-byte public address.');
  return text;
}
export function transactionSignature(value: string): string {
  if (bs58.decode(value).length !== 64) throw new Error('Invalid transaction signature.');
  return value;
}
export function explorer(kind: 'account' | 'tx', value: string): string {
  const identifier = kind === 'account' ? publicAddress(value) : transactionSignature(value);
  const url = new URL(`/${kind}/${encodeURIComponent(identifier)}`, 'https://cookiescan.io');
  if (url.protocol !== 'https:' || url.hostname !== 'cookiescan.io') throw new Error('Unsupported external link.');
  return url.href;
}
