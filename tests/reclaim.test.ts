import { describe, expect, it } from 'vitest';
import { Reclaimer, STORAGE_KEY } from '../src/reclaim';
import { TOKEN_2022 } from '../src/domain';
import { FixtureRpc, FixtureWallet, GENESIS, MemoryStorage, OTHER, SOURCE, token } from './fixtures';

function setup() {
  const wallet = new FixtureWallet(), rpc = new FixtureRpc(wallet.key.publicKey.toBase58()), storage = new MemoryStorage();
  const engine = new Reclaimer(rpc, wallet, storage, GENESIS);
  const prepare = () => engine.prepare(SOURCE, wallet.key.publicKey.toBase58());
  return { wallet, rpc, storage, engine, prepare };
}
describe('reclaim approval boundaries', () => {
  it('simulates an exact transaction and signs only on explicit final confirmation', async () => {
    const { wallet, rpc, engine, prepare } = setup();
    await engine.confirm(); expect(wallet.signCalls).toBe(0);
    await prepare();
    expect(engine.state.phase).toBe('ready');
    expect(engine.state.preview?.gross).toBe(2039280n);
    expect(engine.state.preview?.fee).toBe(5000n);
    expect(engine.state.preview?.net).toBe(2034280n);
    expect(wallet.signCalls).toBe(0);
    const simulation = rpc.calls.find(call => call.method === 'simulateTransaction');
    expect(simulation?.params[1]).toMatchObject({ sigVerify: false, replaceRecentBlockhash: false });
    await engine.confirm();
    expect(wallet.signCalls).toBe(1); expect(rpc.sendCount).toBe(1);
    expect(engine.state.phase).toBe('confirmed');
  });
  it.each(['fee', 'balance', 'net', 'simulation', 'network', 'program'] as const)('blocks %s failure before signing', async problem => {
    const { wallet, rpc, engine, prepare } = setup();
    if (problem === 'fee') rpc.fee = null;
    if (problem === 'balance') rpc.balance = 4999n;
    if (problem === 'net') rpc.fee = 2039280n;
    if (problem === 'simulation') rpc.simulationError = { InstructionError: [0, 'InvalidAccountData'] };
    if (problem === 'network') rpc.genesis = OTHER;
    if (problem === 'program') rpc.executable = false;
    await prepare(); await engine.confirm();
    expect(engine.state.phase).toBe('failed'); expect(wallet.signCalls).toBe(0); expect(rpc.sendCount).toBe(0);
  });
  it.each([
    { amount: 1n }, { program: OTHER }, { program: TOKEN_2022 }, { owner: OTHER },
    { closeAuthority: OTHER }, { delegate: OTHER }, { state: 'frozen' as const },
    { state: 'uninitialized' as const }, { native: true },
  ])('rejects unsafe raw account case %# before signing', async patch => {
    const { wallet, rpc, engine, prepare } = setup();
    rpc.account = token(wallet.key.publicKey.toBase58(), patch);
    await prepare(); await engine.confirm();
    expect(engine.state.phase).toBe('failed'); expect(wallet.signCalls).toBe(0);
  });
  it('does not offer signing for another inspected address', async () => {
    const { engine, wallet, rpc } = setup();
    await engine.prepare(SOURCE, OTHER);
    expect(engine.state.phase).toBe('failed'); expect(wallet.signCalls).toBe(0); expect(rpc.calls).toHaveLength(0);
  });
  it('handles approval rejection without broadcasting', async () => {
    const { wallet, rpc, engine, prepare } = setup();
    await prepare(); wallet.reject = true; await engine.confirm();
    expect(engine.state.phase).toBe('rejected'); expect(rpc.sendCount).toBe(0);
  });
  it('prevents duplicate signing and broadcasting on repeated clicks', async () => {
    const { wallet, rpc, engine, prepare } = setup();
    await prepare();
    await Promise.all([engine.confirm(), engine.confirm(), engine.confirm()]);
    expect(wallet.signCalls).toBe(1); expect(rpc.sendCount).toBe(1);
  });
  it.each(['switch', 'disconnect', 'cancel', 'eligibility', 'disappeared', 'fee', 'genesis', 'expiry'] as const)('blocks %s during approval without rebuilding or broadcasting', async change => {
    const { wallet, rpc, engine, prepare } = setup();
    await prepare();
    wallet.beforeReturn = () => {
      if (change === 'switch') wallet.snapshot = { address: OTHER, revision: 2 };
      if (change === 'disconnect') wallet.snapshot = null;
      if (change === 'cancel') engine.cancel();
      if (change === 'eligibility' && rpc.account) rpc.account.amount = 1n;
      if (change === 'disappeared') rpc.account = null;
      if (change === 'fee') rpc.fee = 6000n;
      if (change === 'genesis') rpc.genesis = OTHER;
      if (change === 'expiry') rpc.height = 101n;
    };
    await engine.confirm();
    expect(rpc.sendCount).toBe(0); expect(wallet.signCalls).toBe(1);
    expect(engine.state.phase).not.toBe('confirmed');
    expect(engine.state.preview).toBeNull();
  });
  it('blocks changed signed messages and expired previews', async () => {
    const first = setup(); await first.prepare(); first.wallet.mutate = true; await first.engine.confirm();
    expect(first.rpc.sendCount).toBe(0); expect(first.engine.state.phase).toBe('failed');
    const second = setup(); await second.prepare(); second.rpc.height = 101n; await second.engine.confirm();
    expect(second.wallet.signCalls).toBe(0); expect(second.engine.state.phase).toBe('expired');
  });
  it('blocks a disappeared account before creating a preview', async () => {
    const { rpc, engine, prepare } = setup(); rpc.account = null; await prepare();
    expect(engine.state.phase).toBe('failed'); expect(engine.state.message).toContain('disappeared');
  });
});
describe('submission retention and reconciliation', () => {
  it('retains original validity data, survives reload, and never replaces an unknown transaction', async () => {
    const { wallet, rpc, storage, engine, prepare } = setup();
    await prepare(); rpc.sendError = true; rpc.statusError = true; await engine.confirm();
    expect(engine.state.phase).toBe('unknown/pending');
    expect(engine.pending?.blockhash).toBe(GENESIS);
    expect(engine.pending?.lastValidBlockHeight).toBe('100');
    const serialized = storage.getItem(STORAGE_KEY) ?? '';
    expect(serialized).not.toContain('signedTransaction');
    const reloaded = new Reclaimer(rpc, wallet, storage, GENESIS);
    await reloaded.prepare(SOURCE, wallet.key.publicKey.toBase58()); await reloaded.confirm();
    expect(rpc.sendCount).toBe(1); expect(wallet.signCalls).toBe(1);
    rpc.statusError = false; rpc.status = { confirmationStatus: 'finalized', slot: 40, err: null };
    await reloaded.reconcile();
    expect(reloaded.state.phase).toBe('finalized'); expect(reloaded.pending).toBeNull();
    expect(reloaded.history).toHaveLength(1); expect(reloaded.history[0].slot).toBe(40);
  });
  it('does not infer success or failure from null status after expiry', async () => {
    const { rpc, engine, prepare } = setup();
    await prepare(); rpc.status = null; await engine.confirm(); rpc.height = 101n; await engine.reconcile();
    expect(engine.state.phase).toBe('unknown/pending'); expect(engine.canPrepare).toBe(false);
    expect(engine.state.message).toContain('does not prove');
    expect(rpc.calls.some(call => call.method === 'getTransaction')).toBe(true);
  });
  it('requires confirmed/finalized status and an explicit null error', async () => {
    const { rpc, engine, prepare } = setup();
    await prepare(); rpc.status = { confirmationStatus: 'processed', slot: 20, err: null }; await engine.confirm();
    expect(engine.state.phase).toBe('confirming');
    rpc.status = { confirmationStatus: 'confirmed', slot: 20 }; await engine.reconcile();
    expect(engine.state.phase).toBe('unknown/pending');
    rpc.status = { confirmationStatus: 'confirmed', slot: 20, err: { InstructionError: [0, 'InvalidAccountData'] } }; await engine.reconcile();
    expect(engine.state.phase).toBe('failed');
  });
  it('can reconcile a confirmed transaction when signature status is unavailable after expiry', async () => {
    const { rpc, engine, prepare } = setup();
    await prepare(); rpc.status = null; await engine.confirm();
    rpc.height = 101n; rpc.transaction = { slot: 22, meta: { err: null } }; await engine.reconcile();
    expect(engine.state.phase).toBe('confirmed'); expect(engine.state.submission?.slot).toBe(22);
  });
  it('blocks writes when saved history is corrupt or persistence fails before broadcast', async () => {
    const first = setup(); first.storage.setItem(STORAGE_KEY, '{bad');
    const blocked = new Reclaimer(first.rpc, first.wallet, first.storage, GENESIS);
    expect(blocked.canPrepare).toBe(false);
    const second = setup(); await second.prepare(); second.storage.setItem = () => { throw new Error('Quota'); };
    await second.engine.confirm(); expect(second.rpc.sendCount).toBe(0); expect(second.engine.state.phase).toBe('failed');
  });
});
