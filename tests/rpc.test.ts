import { describe, expect, it, vi } from 'vitest';
import { CookieRpc, RPC_URL, parseRpcJson } from '../integrations/rpc';

function response(init: RequestInit | undefined, result: string): Response {
  const request = JSON.parse(String(init?.body));
  return new Response(`{"jsonrpc":"2.0","id":${request.id},"result":${result}}`, { status: 200 });
}
describe('RPC transport', () => {
  it('parses every integer losslessly', () => {
    expect(parseRpcJson('{"value":9007199254740993123,"small":9}')).toEqual({ value: '9007199254740993123', small: '9' });
    expect(parseRpcJson('{"nested":[0,-32005,{"values":[9,9007199254740993123,-9007199254740993123,18446744073709551615]}],"text":"9","flag":true,"missing":null}')).toEqual({
      nested: ['0', '-32005', { values: ['9', '9007199254740993123', '-9007199254740993123', '18446744073709551615'] }],
      text: '9', flag: true, missing: null,
    });
    expect(parseRpcJson('9')).toBe('9');
    expect(parseRpcJson('{"toFixed":"text","value":9}')).toEqual({ toFixed: 'text', value: '9' });
  });
  it('retains prototype and constructor rejection at every depth', () => {
    for (const body of ['{"__proto__":{"polluted":true}}', '{"constructor":{}}', '{"nested":[{"__proto__":{}}]}', '{"nested":{"constructor":{}}}']) {
      expect(() => parseRpcJson(body)).toThrow();
    }
  });
  it.each(['default', 'injected'] as const)('invokes %s fetch with a valid global receiver', async mode => {
    const fetcher = vi.fn(function (this: unknown, url: string | URL | Request, init?: RequestInit): Promise<Response> {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      expect(url).toBe(RPC_URL);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(response(init, '9'));
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetcher);
    try {
      const rpc = new CookieRpc(mode === 'default' ? undefined : fetcher, 100, 1);
      await expect(rpc.call('getBalance')).resolves.toBe('9');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('uses only the explicit Cookie Chain endpoint with bounded rate-limit retries', async () => {
    let calls = 0;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe(RPC_URL);
      expect(init?.credentials).toBe('omit');
      if (++calls < 3) return new Response('', { status: 429 });
      return response(init, '9007199254740993123');
    }) as typeof fetch;
    expect(await new CookieRpc(fetcher, 100, 1).call('getBalance')).toBe('9007199254740993123');
    expect(calls).toBe(3);
  });
  it('does not retry a transaction broadcast', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(new CookieRpc(fetcher, 100, 1).call('sendTransaction')).rejects.toThrow('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds offline read retries and rejects malformed or mismatched responses', async () => {
    const offline = vi.fn(async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(new CookieRpc(offline, 100, 1).call('getBalance')).rejects.toThrow();
    expect(offline).toHaveBeenCalledTimes(3);
    for (const body of ['not json', '{"jsonrpc":"2.0","id":999,"result":0}', '{"jsonrpc":"2.0","id":1}']) {
      const malformed = vi.fn(async () => new Response(body)) as typeof fetch;
      await expect(new CookieRpc(malformed).call('getBalance')).rejects.toThrow();
      expect(malformed).toHaveBeenCalledTimes(1);
    }
  });
  it('times out requests and allows stale inspections to abort without retries', async () => {
    const stalled = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })) as typeof fetch;
    await expect(new CookieRpc(stalled, 5, 1).call('getBalance')).rejects.toThrow('timed out');
    expect(stalled).toHaveBeenCalledTimes(3);
    const controller = new AbortController(); controller.abort();
    const fresh = vi.fn() as unknown as typeof fetch;
    await expect(new CookieRpc(fresh).call('getBalance', [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fresh).not.toHaveBeenCalled();
  });
});
