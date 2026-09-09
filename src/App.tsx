import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CookieRpc } from '../integrations/rpc';
import { NightlyWallet } from '../integrations/nightly';
import { explorer, publicAddress } from '../integrations/explorer';
import { loadOverview, summarize, type Overview } from './analytics';
import { ineligible, units } from './domain';
import { Reclaimer } from './reclaim';

const rpc = new CookieRpc();
const nightly = new NightlyWallet();
const expectedGenesis = (import.meta.env.VITE_COOKIE_GENESIS_HASH ?? '').trim();
const reclaimer = new Reclaimer(rpc, nightly, {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}, expectedGenesis);
function AccountLink({ address }: { address: string }) {
  return <a className="mono" href={explorer('account', address)} target="_blank" rel="noopener noreferrer">{address} ↗</a>;
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Request failed. Please retry.'; }

export default function App() {
  const [wallet, setWallet] = useState(nightly.current());
  const [input, setInput] = useState('');
  const [inspected, setInspected] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [walletError, setWalletError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState(reclaimer.state);
  const abort = useRef<AbortController | null>(null);
  const refreshedSignature = useRef('');
  function inspect(address: string) {
    abort.current?.abort();
    reclaimer.cancel();
    setData(null); setError(''); setInspected(address); setInput(address);
  }
  useEffect(() => nightly.subscribe(() => {
    const next = nightly.current();
    setWallet(next);
    inspect(next?.address ?? '');
  }), []);
  useEffect(() => reclaimer.subscribe(() => setAction({ ...reclaimer.state })), []);
  useEffect(() => {
    if (!inspected) { setLoading(false); return; }
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true); setError('');
    void loadOverview(rpc, inspected, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [inspected, refresh]);
  useEffect(() => {
    if ((action.phase === 'confirmed' || action.phase === 'finalized') && action.submission && refreshedSignature.current !== action.submission.signature) {
      refreshedSignature.current = action.submission.signature;
      setRefresh(value => value + 1);
    }
  }, [action]);
  async function connect() {
    setConnecting(true); setWalletError('');
    try { await nightly.connect(); } catch (reason) { setWalletError(errorMessage(reason)); }
    finally { setConnecting(false); }
  }
  async function disconnect() {
    try { await nightly.disconnect(); } catch (reason) { setWalletError(errorMessage(reason)); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try { inspect(publicAddress(input)); }
    catch { setError('Enter a valid canonical 32-byte SVM public address.'); }
  }
  async function copy() {
    if (!wallet) return;
    try { await navigator.clipboard.writeText(wallet.address); setCopyMessage('Address copied.'); }
    catch { setCopyMessage('Copy unavailable. Select and copy the full address below.'); }
  }
  const analytics = data ? summarize(data.activity, data.address, new Date(data.updatedAt)) : null;
  const refundable = data?.accounts.reduce((total, account) => total + (ineligible(account, data.address) ? 0n : account.lamports), 0n) ?? 0n;
  const ownsInspection = !!wallet && inspected === wallet.address;
  const networkMatches = !!expectedGenesis && data?.genesis === expectedGenesis;
  const canReclaim = ownsInspection && networkMatches && !loading && !error;
  const preview = action.preview;
  const maximumDay = Math.max(1, ...(analytics?.days.map(day => day.count) ?? []));
  return <>
    <header className="header shell">
      <a className="brand" href="#top" aria-label="CookieLens home"><span className="brand-mark">C<span>·</span></span>CookieLens</a>
      <span className="network"><span className="dot" />Cookie Chain</span>
      <div className="wallet-controls">
        <label className="sr-only" htmlFor="wallet-choice">Wallet</label>
        <select id="wallet-choice" aria-label="Wallet"><option>Nightly</option></select>
        {wallet ? <button onClick={() => void disconnect()}>Disconnect</button> : <button className="primary" disabled={connecting} onClick={() => void connect()}>{connecting ? 'Connecting…' : 'Connect Nightly'}</button>}
      </div>
    </header>
    <main id="top" className="shell">
      <section className="hero">
        <p className="eyebrow">A clearer view of your wallet</p>
        <h1>See what your wallet<br /><em>leaves behind.</em></h1>
        <p className="lede">Your COOK, recent activity, and refundable account storage. One focused view. One carefully reviewed reclaim at a time.</p>
        <div className="chips"><span>No price guesses</span><span>No bulk actions</span><span>Your wallet signs</span></div>
      </section>
      {walletError && <p role="alert" className="notice error">{walletError}</p>}
      {wallet && <section className="connected panel" aria-label="Connected wallet">
        <div><p className="eyebrow">Nightly connected · Cookie Chain RPC</p><AccountLink address={wallet.address} /></div>
        <button onClick={() => void copy()}>Copy address</button>
        <span role="status">{copyMessage}</span>
      </section>}
      <form className="inspect panel" onSubmit={submit}>
        <div className="grow"><label htmlFor="address">Inspect a public wallet</label><input id="address" value={input} onChange={event => setInput(event.target.value)} placeholder="Paste a 32-byte SVM public address" autoComplete="off" spellCheck={false} /></div>
        <button type="submit">Inspect address</button>
        {wallet && !ownsInspection && <button type="button" onClick={() => inspect(wallet.address)}>My wallet</button>}
      </form>
      <p className="muted small">Public-address inspection is read-only. Reclaim is available only for the connected Nightly wallet. Token-2022, multisig and other unsupported accounts are excluded.</p>
      {!expectedGenesis && <p className="notice">Read-only release configuration: verified Cookie Chain genesis identity has not been configured. Reclaim is disabled.</p>}
      {data && !networkMatches && expectedGenesis && <p className="notice error" role="alert">Network identity mismatch. Reads are shown with their observed identity; reclaim is blocked.</p>}
      <div className="section-title">
        <h2>Wallet overview</h2>
        <button disabled={!inspected || loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div role="status" aria-live="polite" className="status-line">
        {loading ? 'Reading live Cookie Chain data…' : error ? `Refresh unavailable. ${data ? 'Displayed data is stale.' : 'No wallet data available.'}` : data ? `Updated ${data.updatedAt} · slots ${data.oldestSlot}–${data.slot}` : 'Connect Nightly or inspect a public address to begin.'}
      </div>
      {error && <div role="alert" className="notice error">{error} <button disabled={!inspected || loading} onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
      {!data && !loading && !error && <section className="empty panel"><span className="empty-symbol">◎</span><h3>Your wallet, with context.</h3><p>Explore live balances and a bounded activity sample. Connecting never requests a transaction signature.</p></section>}
      {data && analytics && <>
        <p className="small">Inspecting <AccountLink address={data.address} /> {ownsInspection ? <span className="tag">Your connected wallet</span> : <span className="tag">Read-only</span>}</p>
        <div className="metrics">
          <article className="panel metric"><p>Native balance</p><strong>{units(data.balance)} <small>COOK</small></strong><span>{data.balance.toString()} base units</span></article>
          <article className="panel metric"><p>Eligible storage refund</p><strong>{units(refundable)} <small>COOK</small></strong><span>Gross estimate · fees deducted per closure</span></article>
          <article className="panel metric"><p>Known sampled fees paid</p><strong>{analytics.available || !data.activity.length ? units(analytics.fees) : 'Unavailable'} <small>{analytics.available || !data.activity.length ? 'COOK' : ''}</small></strong><span>{analytics.unavailable ? `Partial: ${analytics.unavailable} details unavailable` : 'Only fees where this wallet is the payer'}</span></article>
        </div>
        <section className="panel activity-chart">
          <div className="section-title"><div><p className="eyebrow">Seven days · UTC</p><h2>A little context for every action.</h2></div><span className="tag">{data.activity.length} / 50 signatures</span></div>
          <p className="muted">{analytics.successful} successful · {analytics.failed} failed in the newest deduplicated sample. {analytics.unavailable} details unavailable. {analytics.unknownTimes} timestamps unavailable.</p>
          <p className="small muted">Available sample span: {analytics.from ?? 'Unavailable'} → {analytics.to ?? 'Unavailable'}. {analytics.atLimit ? 'The 50-signature limit was reached. Older activity may be omitted.' : 'This bounded sample is not a full historical ledger.'}</p>
          <div className="chart" aria-hidden="true">{analytics.days.map(day => <div key={day.date} className="bar-column"><span>{day.count}</span><div className="bar-track"><div className="bar" style={{ height: `${day.count / maximumDay * 100}%` }} /></div><span>{day.date.slice(5)}</span></div>)}</div>
          <details><summary>Daily activity table</summary><table><caption>Transactions in the sampled seven-day UTC window</caption><thead><tr><th scope="col">UTC date</th><th scope="col">Sampled transactions</th></tr></thead><tbody>{analytics.days.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.count}</td></tr>)}</tbody></table></details>
        </section>
        <section aria-labelledby="accounts-title">
          <div className="section-title"><h2 id="accounts-title">Token accounts <span className="count">{data.accounts.length}</span></h2><span className="muted small">Legacy SPL Token only</span></div>
          <p className="muted">Empty accounts can still hold refundable storage. Closing one removes the account; receiving that token later may require recreation and storage funding.</p>
          {!data.accounts.length && <div className="panel empty"><h3>No legacy token accounts</h3><p>This wallet has no accounts in the supported token program.</p></div>}
          <div className="account-grid">{data.accounts.map(account => {
            const reason = ineligible(account, data.address);
            return <article className="panel token-card" key={account.address}>
              <div className="section-title"><h3>Token account</h3><span className={`tag ${reason ? '' : 'eligible'}`}>{reason ?? 'Eligible empty account'}</span></div>
              <dl><dt>Account</dt><dd><AccountLink address={account.address} /></dd><dt>Mint</dt><dd><AccountLink address={account.mint} /></dd><dt>Token balance</dt><dd>{units(account.amount, account.decimals)} <span className="muted">({account.amount.toString()} raw units · {account.decimals} decimals)</span></dd><dt>Storage balance</dt><dd>{units(account.lamports)} COOK</dd></dl>
              {!reason && ownsInspection && <button className="primary" disabled={!canReclaim || !reclaimer.canPrepare} onClick={() => void reclaimer.prepare(account.address, inspected)}>Review reclaim</button>}
              {!reason && !ownsInspection && <p className="small muted">Read-only: only this account's owner can reclaim.</p>}
            </article>;
          })}</div>
        </section>
      </>}
      <section className="panel reclaim" aria-labelledby="reclaim-title">
        <div className="section-title"><div><p className="eyebrow">One account. Your approval.</p><h2 id="reclaim-title">Safe reclaim</h2></div><span className="tag">{action.phase}</span></div>
        <p role="status" aria-live="polite" aria-atomic="true">{action.message}</p>
        {preview && <>
          <dl className="preview-grid"><dt>Source token account</dt><dd><AccountLink address={preview.raw.account.address} /></dd><dt>Mint</dt><dd><AccountLink address={preview.raw.account.mint} /></dd><dt>Refund destination and signer</dt><dd><AccountLink address={preview.wallet.address} /></dd><dt>Gross refundable COOK</dt><dd>{units(preview.gross)} ({preview.gross.toString()} base units)</dd><dt>Estimated network fee</dt><dd>{units(preview.fee)} COOK</dd><dt>Estimated net return</dt><dd className="net">{units(preview.net)} COOK</dd><dt>Verified genesis</dt><dd className="mono">{preview.network.genesis}</dd><dt>Verified executable program</dt><dd><AccountLink address={preview.network.program} /></dd><dt>Verification</dt><dd>{preview.network.checkedAt} · slot {preview.network.slot}</dd><dt>Validity bound</dt><dd>Block height {preview.lastValidBlockHeight.toString()}</dd></dl>
          <p className="notice">This closes and removes exactly this token account. Its current storage balance returns to your connected wallet, less the network fee. Future receipt of this token may require recreating the account and funding storage. There is no platform fee.</p>
          <div className="button-row"><button className="primary" disabled={action.phase !== 'ready'} onClick={() => void reclaimer.confirm()}>Confirm and request Nightly approval</button><button onClick={() => reclaimer.cancel()}>Cancel preview</button></div>
        </>}
        {action.submission && <div className="submission"><p>Retained signature: <a className="mono" href={explorer('tx', action.submission.signature)} target="_blank" rel="noopener noreferrer">{action.submission.signature} ↗</a></p><p className="small muted">Original blockhash: <span className="mono">{action.submission.blockhash}</span> · last valid block height {action.submission.lastValidBlockHeight}{action.submission.slot === undefined ? '' : ` · confirmation slot ${action.submission.slot}`}</p></div>}
        {reclaimer.pending && <button onClick={() => void reclaimer.reconcile()}>Reconcile saved signature</button>}
        {reclaimer.history.length > 0 && <details><summary>Retained submissions ({reclaimer.history.length})</summary><ul>{reclaimer.history.map(item => <li key={item.signature}><a className="mono" href={explorer('tx', item.signature)} target="_blank" rel="noopener noreferrer">{item.signature}</a> — {item.status}</li>)}</ul></details>}
      </section>
      {data && analytics && <section aria-labelledby="activity-title">
        <div className="section-title"><h2 id="activity-title">Recent activity</h2><span className="muted small">Newest 50 signatures · at most 50 details</span></div>
        {!data.activity.length && <div className="panel empty"><h3>No recent signatures returned</h3><p>The RPC returned an empty sample for this address.</p></div>}
        <div className="activity-list">{data.activity.map(row => <article key={row.signature} className="panel activity-row">
          <div className="section-title"><h3>{row.detail?.actions.join(' · ') ?? 'Unknown action'}</h3><span className={`tag ${row.failed ? 'failure' : ''}`}>{row.failed ? 'Failed' : 'Successful'} · {row.finality}</span></div>
          <a className="mono" href={explorer('tx', row.signature)} target="_blank" rel="noopener noreferrer">{row.signature} ↗</a>
          <p className="muted small">{row.time === null ? 'Timestamp unavailable' : new Date(row.time * 1000).toISOString()} · slot {row.slot}</p>
          {row.detail ? <details><summary>Transaction details</summary><dl><dt>Wallet native balance change</dt><dd>{row.detail.delta === null ? 'Unavailable' : `${units(row.detail.delta)} COOK`} <span className="muted">(includes all native changes and fees)</span></dd><dt>Fee payer</dt><dd><AccountLink address={row.detail.feePayer} /></dd><dt>Actual network fee</dt><dd>{units(row.detail.fee)} COOK {row.detail.feePayer === data.address ? '· paid by this wallet' : '· paid by another account'}</dd></dl></details> : <p className="muted">{row.unavailable}</p>}
        </article>)}</div>
      </section>}
    </main>
    <footer className="shell"><p>CookieLens <span className="muted">by stonegate-labs</span></p><p><a href="https://github.com/stonegate-labs/cookielens" target="_blank" rel="noopener noreferrer">Open source ↗</a> · <a href="https://docs.cookiechain.wtf/bridge" target="_blank" rel="noopener noreferrer">Official bridge guidance ↗</a></p><p className="small muted">No tracking, prices, trading or custody. RPC providers and the wallet extension can observe requests made to them.</p></footer>
  </>;
}
