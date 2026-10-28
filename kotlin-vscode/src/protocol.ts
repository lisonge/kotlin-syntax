export interface Snapshot { key: string; version: number; source: string; script: boolean }
export interface Edit { start: number; end: number; text: string }
export interface FileSymbols {
  query?: { root: { path: string[]; mode: 'symbol' | 'instance' | 'constructor'; bindingStart?: number; typeOnly?: boolean; typeMembers?: string[] }; members: string[]; type: boolean; parameter?: string | null; callable?: boolean; offset?: number } | null;
  reference?: { name: string; type: boolean; constructorOnly?: boolean; importOnly?: boolean } | null;
  packageName: string[];
  imports: { name: string; star: boolean; path: string[]; segments: { start: number; end: number; path: string[] }[]; start: number; end: number }[];
  declarations: Declaration[];
}
export interface Declaration {
  expectActual?: { role: 'expect' | 'actual'; keyword: [number, number] | null; classifier: string;
    typeParameters: number; receiver: string[]; parameters: string[][]; contexts: string[][]; suspend: boolean };
  name: string; kind: string; path: string[]; aliases: string[][]; private: boolean; privateScopes?: [number, number][]; static: boolean;
  parameters?: { name: string; start: number; end: number; nameStart: number; nameEnd: number }[];
  typePath: string[]; constructorPath: string[]; extension: boolean;
  start: number; end: number; nameStart: number; nameEnd: number;
}
export type Request = { kind: 'parse'; request: number; snapshot: Snapshot; definitionOffset?: number; symbols?: boolean }
  | { kind: 'edit'; request: number; key: string; baseVersion: number; version: number; script: boolean; batches: Edit[][]; definitionOffset?: number; symbols?: boolean }
  | { kind: 'close'; key: string };
export type Response = { kind: 'ready' }
  | { kind: 'symbols'; request: number; version: number; data: string }
  | { kind: 'result'; request: number; version: number; data: Uint32Array }
  | { kind: 'resync'; request: number }
  | { kind: 'error'; request: number; error: string };
/** Split multiline spans and delta-encode them in the worker, before transferring the buffer. */
export function encodeTokens(source: string, spans: ArrayLike<number>): Uint32Array {
  const starts = [0], ends: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r' || source[i] === '\n') {
      ends.push(i);
      if (source[i] === '\r' && source[i + 1] === '\n') i++;
      starts.push(i + 1);
    }
  }
  ends.push(source.length);
  const result: number[] = []; let line = 0, previousLine = 0, previousColumn = 0;
  for (let i = 0; i < spans.length; i += 4) {
    const start = spans[i], end = spans[i + 1], type = spans[i + 2], modifiers = spans[i + 3];
    while (line + 1 < starts.length && starts[line + 1] <= start) line++;
    for (let row = line; row < starts.length && starts[row] < end; row++) {
      const from = Math.max(start, starts[row]), to = Math.min(end, ends[row]);
      if (to <= from) continue;
      const column = from - starts[row];
      result.push(row - previousLine, row === previousLine ? column - previousColumn : column, to - from, type, modifiers);
      previousLine = row; previousColumn = column;
    }
  }
  return Uint32Array.from(result);
}
