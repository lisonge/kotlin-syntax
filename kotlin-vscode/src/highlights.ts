/** Semantic-token edits address the encoded integer array, not source offsets. */
export function tokenDelta(old: Uint32Array, next: Uint32Array): { start: number; deleteCount: number; data: Uint32Array } {
  let prefix = 0, suffix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return { start: prefix, deleteCount: old.length - prefix - suffix, data: next.slice(prefix, next.length - suffix) };
}
