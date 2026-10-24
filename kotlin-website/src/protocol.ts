export interface Edit { start: number; end: number; text: string }
export type Request = { kind: 'sync'; version: number; source: string; script: boolean }
  | { kind: 'edit'; baseVersion: number; version: number; edits: Edit[] };
export type Result = { version: number; spans: Int32Array; elapsed: number }
  | { version: number; resync: true }
  | { version: number; error: string };
