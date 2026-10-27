import { Worker } from 'node:worker_threads';

export interface FormatRequest {
  key: string;
  source: string;
  script: boolean;
  style: 'META' | 'GOOGLE' | 'KOTLINLANG';
  maxWidth: number;
  removeUnusedImports?: boolean;
  preserveLambdaBreaks?: boolean;
}
export type FormatReply = { id: number; text: string } | { id: number; error: string };
interface Subscriber {
  resolve: (text: string | undefined) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
interface Job {
  id: number;
  request: FormatRequest;
  subscribers: Set<Subscriber>;
  text?: string;
}
function sameInput(a: FormatRequest, b: FormatRequest): boolean {
  return a.key === b.key && a.source === b.source && a.script === b.script && a.style === b.style && a.maxWidth === b.maxWidth
    && (a.removeUnusedImports ?? true) === (b.removeUnusedImports ?? true)
    && (a.preserveLambdaBreaks ?? true) === (b.preserveLambdaBreaks ?? true);
}

/** One latest input/result per open document, with shared computation for identical pending requests. */
export class FormatClient {
  private worker?: Worker;
  private serial = 0;
  private disposed = false;
  private documents = new Map<string, Job>();
  private pending = new Map<number, Job>();

  private readonly createWorker: () => Worker;
  constructor(createWorker: () => Worker = () => new Worker(new URL('./format-worker.js', import.meta.url))) {
    this.createWorker = createWorker;
  }

  request(request: FormatRequest, signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined);
    if (this.disposed) return Promise.reject(new Error('Formatter disposed'));
    const cached = this.documents.get(request.key);
    if (cached?.text !== undefined && sameInput(cached.request, request)) return Promise.resolve(cached.text);
    const shared = [...this.pending.values()].find(job => sameInput(job.request, request));
    if (shared) {
      this.documents.set(request.key, shared);
      return this.subscribe(shared, signal);
    }
    const job: Job = { id: ++this.serial, request: { ...request }, subscribers: new Set() };
    this.documents.set(request.key, job);
    this.pending.set(job.id, job);
    const result = this.subscribe(job, signal);
    try { this.getWorker().postMessage({ id: job.id, ...job.request }); }
    catch (error) { this.finish(job, { id: job.id, error: error instanceof Error ? error.message : String(error) }); }
    return result;
  }

  private subscribe(job: Job, signal?: AbortSignal): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        job.subscribers.delete(subscriber); subscriber.cleanup(); resolve(undefined);
        if (!job.subscribers.size) this.finish(job);
      };
      const subscriber = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) };
      job.subscribers.add(subscriber);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  private finish(job: Job, reply?: FormatReply): void {
    this.pending.delete(job.id);
    if (this.documents.get(job.request.key) === job) {
      if (reply && 'text' in reply) job.text = reply.text;
      else this.documents.delete(job.request.key);
    }
    for (const subscriber of job.subscribers) {
      subscriber.cleanup();
      if (reply && 'error' in reply) subscriber.reject(new Error(reply.error));
      else subscriber.resolve(reply?.text);
    }
    job.subscribers.clear();
  }

  private getWorker(): Worker {
    if (!this.worker) {
      const worker = this.worker = this.createWorker();
      worker.on('message', (reply: FormatReply) => {
        const job = this.pending.get(reply.id);
        if (job) this.finish(job, reply);
      });
      const fail = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = undefined;
        for (const job of this.pending.values()) this.finish(job, { id: job.id, error: error.message });
      };
      worker.on('error', fail);
      worker.on('exit', code => fail(new Error(`Formatter worker exited (${code})`)));
    }
    return this.worker;
  }

  close(key: string): void {
    this.documents.delete(key);
    for (const job of this.pending.values()) if (job.request.key === key) this.finish(job);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const worker = this.worker; this.worker = undefined;
    this.documents.clear();
    for (const job of this.pending.values()) this.finish(job);
    await worker?.terminate();
  }
}
