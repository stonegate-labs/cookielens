import JSONbig from 'json-bigint';

export const RPC_URL = 'https://rpc.cookiescan.io';
export interface RpcPort {
  call<T = unknown>(method: string, params?: unknown[], signal?: AbortSignal): Promise<T>;
}
export class RpcError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}
const parser = JSONbig({ storeAsString: true, alwaysParseAsBig: true, protoAction: 'error', constructorAction: 'error' });
function normalizeRpcNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeRpcNumbers);
  if (value !== null && typeof value === 'object') {
    // Small numbers can still be BigNumber instances with storeAsString enabled.
    if ('toFixed' in value && typeof value.toFixed === 'function') return value.toFixed();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeRpcNumbers(item)]));
  }
  return value;
}
export function parseRpcJson(text: string): unknown { return normalizeRpcNumbers(parser.parse(text)); }

function abortError(): DOMException { return new DOMException('Request cancelled', 'AbortError'); }
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class CookieRpc implements RpcPort {
  private nextId = 0;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
    private readonly backoffMs = 350,
  ) {}
  async call<T = unknown>(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<T> {
    const attempts = method === 'sendTransaction' ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal?.aborted) throw abortError();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, this.timeoutMs);
      try {
        const id = ++this.nextId;
        const response = await this.fetcher.call(globalThis, RPC_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: controller.signal, credentials: 'omit', cache: 'no-store',
        });
        if (!response.ok) throw new RpcError(`Cookie Chain RPC HTTP ${response.status}. Retry when service recovers.`, response.status === 429 || response.status >= 500);
        let body: unknown;
        try { body = parseRpcJson(await response.text()); }
        catch { throw new RpcError('Cookie Chain RPC returned malformed JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RpcError('Cookie Chain RPC returned an invalid envelope.');
        const envelope = body as Record<string, unknown>;
        if (envelope.jsonrpc !== '2.0' || String(envelope.id) !== String(id)) throw new RpcError('Cookie Chain RPC returned a mismatched response.');
        if (envelope.error) {
          const error = envelope.error as Record<string, unknown>;
          throw new RpcError(`Cookie Chain RPC rejected ${method} (code ${String(error.code)}).`, String(error.code) === '-32005');
        }
        if (!Object.hasOwn(envelope, 'result')) throw new RpcError('Cookie Chain RPC omitted its result.');
        return envelope.result as T;
      } catch (error) {
        if (signal?.aborted) throw abortError();
        const normalized = error instanceof RpcError ? error : new RpcError('Cookie Chain RPC unavailable or timed out. Check connectivity and retry.', true);
        if (!normalized.retryable || attempt + 1 === attempts) throw normalized;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      await pause(this.backoffMs * 2 ** attempt, signal);
    }
    throw new RpcError('Cookie Chain RPC unavailable.');
  }
}
