export interface Snapshot { key: string; version: number; source: string; script: boolean }
export type Request = { kind: 'parse'; request: number; snapshot: Snapshot } | { kind: 'close'; key: string };
export interface Response { ready?: boolean; request: number; data?: Uint32Array; error?: string }
/** Split multiline spans and delta-encode them in the worker, before transferring the buffer. */
export function encodeTokens(source: string, spans: number[]): Uint32Array {
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
    const [start, end, type, modifiers] = spans.slice(i, i + 4);
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
export function replacement(before: string, after: string) {
  let start = 0, suffix = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (suffix < before.length - start && suffix < after.length - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { start, end: before.length - suffix, text: after.slice(start, after.length - suffix) };
}
