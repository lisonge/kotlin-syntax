import themeData from '../vendor/one-dark-pro/theme.json' with { type: 'json' };
import { tokenModifiers, tokenTypes } from '../../kotlin-vscode/src/highlights.ts';

interface Settings { foreground?: string; fontStyle?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean }
interface Theme { colors: Record<string, string>; tokenColors: { scope?: string | string[]; settings: Settings }[]; semanticTokenColors: Record<string, string | Settings> }
export const theme: Theme = themeData;

// VS Code's built-in semantic scope probes. Each entry is an alternative single-scope
// probe, not a Kotlin TextMate grammar. Labels deliberately have no default probe.
// https://github.com/microsoft/vscode/blob/main/src/vs/platform/theme/common/tokenClassificationRegistry.ts
const probes: Record<string, string[]> = {
  namespace: ['entity.name.namespace'], type: ['entity.name.type', 'support.type'],
  class: ['entity.name.type.class', 'support.class'], interface: ['entity.name.type.interface'],
  enumMember: ['variable.other.enummember'], typeParameter: ['entity.name.type.parameter'],
  parameter: ['variable.parameter'], variable: ['variable.other.readwrite', 'entity.name.variable'],
  property: ['variable.other.property'], function: ['entity.name.function', 'support.function'],
  keyword: ['keyword.control'], comment: ['comment'], string: ['string'], number: ['constant.numeric'],
  operator: ['keyword.operator'], decorator: ['entity.name.decorator', 'entity.name.function'],
  enum: ['entity.name.type.enum'], method: ['entity.name.function.member', 'support.function'], label: [],
};

function probe(scope: string): Settings | undefined {
  const result: Settings = {};
  const scores = { foreground: -1, fontStyle: -1 };
  for (const rule of theme.tokenColors) {
    for (const selector of (Array.isArray(rule.scope) ? rule.scope : [rule.scope ?? '']).flatMap(value => value.split(','))) {
      const candidate = selector.trim();
      // Parent-qualified selectors cannot match a single-scope VS Code probe.
      if (!candidate || /\s/.test(candidate) || !(scope === candidate || scope.startsWith(`${candidate}.`))) continue;
      for (const key of ['foreground', 'fontStyle'] as const) {
        if (rule.settings[key] !== undefined && candidate.length >= scores[key]) {
          scores[key] = candidate.length;
          result[key] = rule.settings[key];
        }
      }
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function fontSettings(settings: Settings): Settings {
  if (settings.fontStyle === undefined) return settings;
  const flags = settings.fontStyle.split(/\s+/);
  return { ...settings, ...Object.fromEntries(['bold', 'italic', 'underline', 'strikethrough'].map(flag => [flag, flags.includes(flag)])) };
}

export function tokenStyle(type: string, bits = 0) {
  const modifiers = tokenModifiers.filter((_, index) => bits & (1 << index));
  let fallback: Settings = {};
  for (const scope of probes[type] ?? []) {
    const match = probe(scope);
    if (match) { fallback = match; break; }
  }
  if (modifiers.includes('readonly') && (type === 'variable' || type === 'property')) {
    fallback = { ...fallback, ...probe(type === 'variable' ? 'variable.other.constant' : 'variable.other.constant.property') };
  }
  const result = fontSettings(fallback);
  const scores: Record<string, number> = {};
  for (const [selector, value] of Object.entries(theme.semanticTokenColors)) {
    const [classification, language] = selector.split(':');
    const [target, ...required] = classification.split('.');
    if ((language && language !== 'kotlin') || (target !== '*' && target !== type) || required.some(modifier => !modifiers.includes(modifier))) continue;
    const score = (target === '*' ? 0 : 100) + required.length * 100 + (language ? 10 : 0);
    const settings = fontSettings(typeof value === 'string' ? { foreground: value } : value);
    for (const key of ['foreground', 'bold', 'italic', 'underline', 'strikethrough'] as const) {
      if (settings[key] !== undefined && score >= (scores[key] ?? -1)) {
        Object.assign(result, { [key]: settings[key] });
        scores[key] = score;
      }
    }
  }
  return {
    color: result.foreground ?? theme.colors['editor.foreground'],
    fontStyle: result.italic ? 'italic' : 'normal',
    fontWeight: result.bold ? 'bold' : 'normal',
    textDecoration: [result.underline ? 'underline' : '', result.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
  };
}

export function tokenClass(type: string, bits: number) { return `token-${type}-${bits}`; }
export const tokenRules = Object.fromEntries(tokenTypes.flatMap(type =>
  Array.from({ length: 1 << tokenModifiers.length }, (_, bits) => [`.${tokenClass(type, bits)}`, tokenStyle(type, bits)])));
