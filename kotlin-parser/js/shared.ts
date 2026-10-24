export { tokenTypes, tokenModifiers } from './generated/legend.ts';

export function replacement(before: string, after: string): { start: number; end: number; text: string } {
  let start = 0, suffix = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (suffix < before.length - start && suffix < after.length - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { start, end: before.length - suffix, text: after.slice(start, after.length - suffix) };
}
