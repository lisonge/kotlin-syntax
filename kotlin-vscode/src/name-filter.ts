const unicodePart = /[\p{L}\p{Nd}_]/u;

function identifierPart(source: string, offset: number): boolean {
  if (offset < 0 || offset >= source.length) return false;
  const code = source.charCodeAt(offset);
  if (code < 128) return code === 95 || (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  // A left boundary may point at the low half of a supplementary character.
  if (code >= 0xdc00 && code <= 0xdfff && offset > 0) {
    const previous = source.charCodeAt(offset - 1);
    if (previous >= 0xd800 && previous <= 0xdbff) offset--;
  }
  return unicodePart.test(String.fromCodePoint(source.codePointAt(offset)!));
}

/** Text prefilter only: comments and strings can match; parsed declarations decide the target. */
export function containsName(source: string, name: string): boolean {
  if (!name.length) return false;
  let offset = source.indexOf(name);
  while (offset !== -1) {
    if (!identifierPart(source, offset - 1) && !identifierPart(source, offset + name.length)) return true;
    offset = source.indexOf(name, offset + 1);
  }
  return false;
}
