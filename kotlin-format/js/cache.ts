import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ResolvedOptions } from './config.ts';

export function fingerprint(source: string, options: ResolvedOptions, script: boolean): string {
  return createHash('sha256').update(JSON.stringify([source, options, script])).digest('hex');
}

export class FormatCache {
  private entries: Record<string, string> = Object.create(null);

  private path: string;
  private identity: string;

  constructor(path: string, identity: string) {
    this.path = path;
    this.identity = identity;
  }

  async load(): Promise<void> {
    let source: string;
    try { source = await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const data = JSON.parse(source);
    if (data.identity === this.identity && data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries)) {
      this.entries = Object.assign(Object.create(null), data.entries);
    }
  }

  has(file: string, key: string): boolean { return this.entries[file] === key; }
  set(file: string, key: string): void { this.entries[file] = key; }
  remove(file: string): void { delete this.entries[file]; }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify({ identity: this.identity, entries: this.entries }));
  }
}
