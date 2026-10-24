import { EditorView } from '@codemirror/view';
import { theme, tokenRules } from './token-theme.ts';

const colors = theme.colors;
export const oneDarkPro = EditorView.theme({
  '&': { color: colors['editor.foreground'], backgroundColor: colors['editor.background'], height: '100%' },
  '.cm-content': { caretColor: colors['editorCursor.foreground'], padding: '20px 0' },
  '.cm-scroller': { fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace', fontSize: '14px', lineHeight: '1.8', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: colors['editor.background'], color: colors['editorLineNumber.foreground'], border: 'none', paddingRight: '16px' },
  '.cm-activeLineGutter': { color: colors['editorLineNumber.activeForeground'], backgroundColor: colors['editor.lineHighlightBackground'] },
  '.cm-activeLine': { backgroundColor: colors['editor.lineHighlightBackground'] },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: colors['editor.selectionBackground'] },
  '.cm-cursor': { borderLeftColor: colors['editorCursor.foreground'] },
  ...tokenRules,
}, { dark: true });
