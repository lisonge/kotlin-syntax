export interface Edit { start: number; end: number; text: string }
export type Request = { kind: 'sync'; version: number; source: string; script: boolean }
  | { kind: 'edit'; baseVersion: number; version: number; edits: Edit[] }
  | { kind: 'definition'; version: number; offset: number; requestId: number };
export type Result = { version: number; spans: Int32Array; elapsed: number }
  | { version: number; definitions: Int32Array; requestId: number }
  | { version: number; resync: true }
  | { version: number; error: string };
