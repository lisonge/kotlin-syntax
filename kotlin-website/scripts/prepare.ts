import { mkdir, writeFile } from 'node:fs/promises';

const { theme, tokenStyle } = await import('./resolve-theme.ts');
const { tokenTypes, tokenModifiers } = await import('kotlin-parser/shared');
const styles: ReturnType<typeof tokenStyle>[] = [];
const tokens = Object.fromEntries(tokenTypes.map(type => [type, Array.from({ length: 1 << tokenModifiers.length }, (_, bits) => {
  const style = tokenStyle(type, bits);
  let index = styles.findIndex(existing => JSON.stringify(existing) === JSON.stringify(style));
  if (index === -1) { index = styles.length; styles.push(style); }
  return index;
})]));
await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/generated/theme.ts', import.meta.url), `export default ${JSON.stringify({ colors: theme.colors, styles, tokens })} as const;\n`);
