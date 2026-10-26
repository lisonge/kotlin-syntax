import { Worker } from 'node:worker_threads';
import type { Snapshot, Response, Edit, Request } from './protocol.ts';
export interface ClientOptions { timeoutMs?: number; maxFailures?: number; log?: (level: 'info' | 'debug' | 'error', message: string) => void; onBlocked?: () => void }
interface Job {
  request: number; snapshot: Snapshot;
  queueKey: string; definitionOffset?: number; symbols: boolean;
  resolve(value: Uint32Array | string | undefined): void; reject(error: Error): void;
  cleanup(): void; settled: boolean;
}
/** One running request plus the latest queued request per document and operation. */
export class ParserClient {
  private worker?: Worker;
  private active?: Job;
  private queued = new Map<string, Job>();
  private documents = new Map<string, { version: number; baseVersion: number; script: boolean; batches: Edit[][] }>();
  private serial = 0;
  private disposed = false;
  private readonly url: URL;
  private readonly options: ClientOptions;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private started = 0;
  get blocked(): boolean { return this.failures >= (this.options.maxFailures ?? 3); }
  private log(level: 'info' | 'debug' | 'error', message: string) { this.options.log?.(level, message); }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined; }
  private async stop(error?: Error) {
    this.clearTimer();
    const worker = this.worker; this.worker = undefined;
    if (this.active) this.finish(this.active, undefined, error);
    this.active = undefined;
    for (const job of this.queued.values()) this.finish(job, undefined, error);
    this.queued.clear();
    this.documents.clear();
    if (worker) await worker.terminate();
  }
  private fail(error: Error) {
    void this.stop(error).catch(() => {});
    this.failures++;
    this.log('error', `Parser failure ${this.failures}: ${error.stack ?? error.message}`);
    if (this.blocked) this.options.onBlocked?.();
  }
  restart(): void {
    if (this.disposed) return;
    void this.stop().catch(() => {});
    this.failures = 0;
    this.log('info', 'Parser reset; next request starts a fresh Worker');
  }
  constructor(url: URL = new URL(import.meta.url.endsWith('.ts') ? './parser-worker.ts' : './parser-worker.js', import.meta.url), options: ClientOptions = {}) { this.url = url; this.options = options; }
  request(snapshot: Snapshot, signal?: AbortSignal): Promise<Uint32Array | undefined> {
    return this.enqueue(snapshot, signal) as Promise<Uint32Array | undefined>;
  }
  definitions(snapshot: Snapshot, offset: number, signal?: AbortSignal): Promise<Uint32Array | undefined> {
    return this.enqueue(snapshot, signal, offset) as Promise<Uint32Array | undefined>;
  }
  symbols(snapshot: Snapshot, signal?: AbortSignal, offset?: number): Promise<string | undefined> { return this.enqueue(snapshot, signal, offset, true) as Promise<string | undefined>; }
  private enqueue(snapshot: Snapshot, signal?: AbortSignal, definitionOffset?: number, symbols = false): Promise<Uint32Array | string | undefined> {
    if (this.disposed) return Promise.reject(new Error('Parser client disposed'));
    if (this.blocked) return Promise.reject(new Error('Parser paused after repeated failures; restart the parser to retry'));
    if (signal?.aborted) return Promise.resolve(undefined);
    const queueKey = `${symbols ? 'symbols' : definitionOffset === undefined ? 'tokens' : 'definitions'}:${snapshot.key}`;
    this.invalidate(snapshot.key, queueKey, snapshot.version);
    return new Promise((resolve, reject) => {
      const job: Job = { request: ++this.serial, snapshot, queueKey, definitionOffset, symbols, resolve, reject, settled: false, cleanup: () => signal?.removeEventListener('abort', abort) };
      const abort = () => {
        this.finish(job);
        if (this.queued.get(queueKey) === job) this.queued.delete(queueKey);
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.queued.set(queueKey, job);
      this.pump();
    });
  }
  invalidate(key: string, queueKey?: string, version?: number): void {
    const matches = (job: Job) => job.snapshot.key === key && (queueKey === undefined || job.queueKey === queueKey || job.snapshot.version !== version);
    if (this.active && matches(this.active)) this.finish(this.active);
    for (const [queuedKey, job] of this.queued) {
      if (matches(job)) { this.finish(job); this.queued.delete(queuedKey); }
    }
  }
  change(key: string, version: number, edits: Edit[]): void {
    this.invalidate(key);
    const state = this.documents.get(key);
    if (!state) return; // The next request initializes from its current snapshot.
    // Bound unsent history; a fresh snapshot replaces an excessive backlog.
    if (state.batches.length >= 64) { this.documents.delete(key); return; }
    state.batches.push(edits.toSorted((a, b) => b.start - a.start));
    state.version = version;
  }
  close(key: string): void {
    this.documents.delete(key);
    this.invalidate(key);
    try { this.worker?.postMessage({ kind: 'close', key }); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private finish(job: Job, data?: Uint32Array | string, error?: Error) {
    if (job.settled) return;
    job.settled = true; job.cleanup();
    if (error) job.reject(error); else job.resolve(data);
  }
  private pump() {
    if (this.active || this.disposed || !this.queued.size) return;
    try {
    if (!this.worker) {
      const worker = this.worker = new Worker(this.url);
      this.log('info', 'Starting parser Worker');
      worker.on('message', (response: Response) => {
        if (this.worker !== worker) return;
        if (response?.kind === 'ready') { this.log('info', 'Worker ready; WASM loaded'); return; }
        if (response?.request !== this.active?.request) return;
        if (response.kind === 'resync') {
          const job = this.active;
          if (!job.settled) {
            worker.postMessage({ kind: 'parse', request: job.request, snapshot: job.snapshot, definitionOffset: job.definitionOffset, symbols: job.symbols } satisfies Request);
            return;
          }
          this.clearTimer(); this.active = undefined; this.pump();
          if (!this.active) worker.unref();
          return;
        }
        if (response.kind === 'error') { this.fail(new Error(response.error)); return; }
        if ((this.active.symbols ? response.kind !== 'symbols' || typeof response.data !== 'string' : response.kind !== 'result' || !(response.data instanceof Uint32Array) || response.data.length % (this.active.definitionOffset === undefined ? 5 : 4) !== 0) || response.version !== this.active.snapshot.version) {
          this.fail(new Error('Invalid parser response')); return;
        }
        this.clearTimer(); this.failures = 0;
        this.log('debug', `Request ${response.request} completed in ${Date.now() - this.started} ms`);
        const job = this.active; this.active = undefined;
        this.finish(job, response.data);
        this.pump();
        if (!this.active) worker.unref();
      });
      const failed = (error: Error) => {
        if (this.worker !== worker) return;
        this.fail(error);
      };
      worker.on('error', failed);
      worker.on('exit', code => failed(new Error(`Parser worker exited (${code})`)));
    }
    let job = this.queued.values().next().value!;
    if (job.symbols) for (const candidate of this.queued.values()) {
      if (!candidate.symbols) { job = candidate; break; }
    }
    this.queued.delete(job.queueKey); this.active = job;
    this.started = Date.now();
    this.log('debug', `Request ${job.request}: version=${job.snapshot.version}, length=${job.snapshot.source.length}, script=${job.snapshot.script}`);
    this.timer = setTimeout(() => this.fail(new Error(`Parser request ${job.request} timed out`)), this.options.timeoutMs ?? 30_000);
    this.worker.ref();
    const { key, version, script } = job.snapshot;
    const state = this.documents.get(key);
    if (state && state.version === version && state.script === script) {
      this.worker.postMessage({ kind: 'edit', request: job.request, key, baseVersion: state.baseVersion, version, script, batches: state.batches, definitionOffset: job.definitionOffset, symbols: job.symbols } satisfies Request);
      state.baseVersion = version; state.batches = [];
    } else {
      this.worker.postMessage({ kind: 'parse', request: job.request, snapshot: job.snapshot, definitionOffset: job.definitionOffset, symbols: job.symbols } satisfies Request);
      this.documents.set(key, { version, baseVersion: version, script, batches: [] });
    }
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.log('info', 'Disposing parser Worker');
    await this.stop();
  }
}
