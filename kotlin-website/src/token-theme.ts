import data from './generated/theme.ts';
const tokens: Record<string, readonly number[]> = data.tokens;
export const theme = { colors: data.colors };
export function tokenClass(type: string, bits: number) { return `token-${tokens[type][bits]}`; }
export function tokenStyle(type: string, bits = 0) { return data.styles[tokens[type][bits]]; }
export const tokenRules = Object.fromEntries(data.styles.map((style, index) => [`.token-${index}`, style]));
