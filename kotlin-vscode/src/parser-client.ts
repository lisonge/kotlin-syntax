import { Worker } from 'node:worker_threads';
import type { Snapshot, Response } from './protocol.ts';
export interface ClientOptions { timeoutMs?: number; maxFailures?: number; log?: (level: 'info' | 'debug' | 'error', message: string) => void; onBlocked?: () => void }
interface Job {
  request: number; snapshot: Snapshot;
  resolve(value: Uint32Array | undefined): void; reject(error: Error): void;
  cleanup(): void; settled: boolean;
}
/** One running request plus the latest queued snapshot per document. */
export class ParserClient {
  private worker?: Worker;
  private active?: Job;
  private queued = new Map<string, Job>();
  private serial = 0;
  private disposed = false;
  private readonly url: URL;
  private readonly options: ClientOptions;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private started = 0;
  get blocked() { return this.failures >= (this.options.maxFailures ?? 3); }
  private log(level: 'info' | 'debug' | 'error', message: string) { this.options.log?.(level, message); }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined; }
  private fail(error: Error) {
    this.clearTimer();
    const worker = this.worker; this.worker = undefined;
    if (this.active) this.finish(this.active, undefined, error);
    this.active = undefined;
    for (const job of this.queued.values()) this.finish(job, undefined, error);
    this.queued.clear();
    this.failures++;
    this.log('error', `Parser failure ${this.failures}: ${error.stack ?? error.message}`);
    if (worker) void worker.terminate().catch(() => {});
    if (this.blocked) this.options.onBlocked?.();
  }
  restart() {
    if (this.disposed) return;
    this.clearTimer();
    const worker = this.worker; this.worker = undefined;
    if (worker) void worker.terminate().catch(() => {});
    if (this.active) this.finish(this.active);
    this.active = undefined;
    for (const job of this.queued.values()) this.finish(job);
    this.queued.clear(); this.failures = 0;
    this.log('info', 'Parser reset; next request starts a fresh Worker');
  }
  constructor(url = new URL(import.meta.url.endsWith('.ts') ? './parser-worker.ts' : './parser-worker.js', import.meta.url), options: ClientOptions = {}) { this.url = url; this.options = options; }
  request(snapshot: Snapshot, signal?: AbortSignal): Promise<Uint32Array | undefined> {
    if (this.disposed) return Promise.reject(new Error('Parser client disposed'));
    if (this.blocked) return Promise.reject(new Error('Parser paused after repeated failures; restart the parser to retry'));
    if (signal?.aborted) return Promise.resolve(undefined);
    this.invalidate(snapshot.key);
    return new Promise((resolve, reject) => {
      const job: Job = { request: ++this.serial, snapshot, resolve, reject, settled: false, cleanup: () => signal?.removeEventListener('abort', abort) };
      const abort = () => {
        this.finish(job);
        if (this.queued.get(snapshot.key) === job) this.queued.delete(snapshot.key);
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.queued.set(snapshot.key, job);
      this.pump();
    });
  }
  invalidate(key: string) {
    if (this.active?.snapshot.key === key) this.finish(this.active);
    const queued = this.queued.get(key);
    if (queued) { this.finish(queued); this.queued.delete(key); }
  }
  close(key: string) {
    this.invalidate(key);
    try { this.worker?.postMessage({ kind: 'close', key }); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private finish(job: Job, data?: Uint32Array, error?: Error) {
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
        if (this.worker === worker && response?.ready) { this.log('info', 'Worker ready; WASM loaded'); return; }
        if (this.worker !== worker || response?.request !== this.active?.request) return;
        if (response.error || !(response.data instanceof Uint32Array) || response.data.length % 5 !== 0) {
          this.fail(new Error(response.error ?? 'Invalid parser response')); return;
        }
        this.clearTimer(); this.failures = 0;
        this.log('debug', `Request ${response.request} completed in ${Date.now() - this.started} ms`);
        const job = this.active; this.active = undefined;
        this.finish(job, response.data, response.error ? new Error(response.error) : undefined);
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
    const job = this.queued.values().next().value!;
    this.queued.delete(job.snapshot.key); this.active = job;
    this.started = Date.now();
    this.log('debug', `Request ${job.request}: version=${job.snapshot.version}, length=${job.snapshot.source.length}, script=${job.snapshot.script}`);
    this.timer = setTimeout(() => this.fail(new Error(`Parser request ${job.request} timed out`)), this.options.timeoutMs ?? 30_000);
    this.worker.ref();
    this.worker.postMessage({ kind: 'parse', request: job.request, snapshot: job.snapshot });
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  async dispose() {
    this.disposed = true;
    this.clearTimer();
    this.log('info', 'Disposing parser Worker');
    if (this.active) this.finish(this.active);
    this.active = undefined;
    for (const job of this.queued.values()) this.finish(job);
    this.queued.clear();
    const worker = this.worker; this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
