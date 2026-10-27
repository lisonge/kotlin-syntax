import { tokenTypes } from 'kotlin-parser/editor';
export interface Node { kind: string; start: number; end: number; children: Node[]; error: string | null }
export interface Highlight { start: number; end: number; type: number; modifiers: number }
export function highlights(tree: Node): Highlight[] {
  const output: Highlight[] = [];
  function visit(node: Node, parents: Node[]) {
    if (node.children.length) { for (const child of node.children) visit(child, [...parents, node]); return; }
    if (node.end <= node.start) return;
    const kind = node.kind;
    const parent = parents.at(-1)?.kind;
    let type: string | undefined, declaration = false;
    let modifiers = kind === 'DOC_COMMENT' ? 16 : 0;
    if (['EOL_COMMENT', 'BLOCK_COMMENT', 'DOC_COMMENT', 'SHEBANG_COMMENT'].includes(kind)) type = 'comment';
    else if (['OPEN_QUOTE', 'CLOSING_QUOTE', 'REGULAR_STRING_PART', 'ESCAPE_SEQUENCE', 'CHARACTER_LITERAL'].includes(kind)) type = 'string';
    else if (['INTEGER_LITERAL', 'FLOAT_LITERAL'].includes(kind)) type = 'number';
    else if (kind.endsWith('_KEYWORD') || ['AS_SAFE', 'NOT_IN', 'NOT_IS'].includes(kind)) type = 'keyword';
    else if (kind === 'IDENTIFIER') {
      const declarations: Record<string, string> = { CLASS: 'class', OBJECT_DECLARATION: 'class', TYPEALIAS: 'type', FUN: 'function', PROPERTY: 'property', VALUE_PARAMETER: 'parameter', TYPE_PARAMETER: 'typeParameter', ENUM_ENTRY: 'enumMember' };
      type = declarations[parent ?? '']; declaration = !!type;
      const owner = parents.at(-1);
      const flags = owner?.children.find(n => n.kind === 'MODIFIER_LIST')?.children ?? [];
      const container = parents.slice(0,-1).findLast((n,i) => ['KT_FILE','SCRIPT','CLASS_BODY','BLOCK','FUN','FUNCTION_LITERAL','PROPERTY_INITIALIZER'].includes(n.kind) && !(n.kind === 'BLOCK' && parents[i-1]?.kind === 'SCRIPT'));
      if (declaration) {
        if (owner?.children.some(n => n.kind === 'VAL_KEYWORD')) modifiers |= 2;
        if (flags.some(n => n.kind === 'ABSTRACT_KEYWORD')) modifiers |= 4;
        if (flags.some(n => n.kind === 'SUSPEND_KEYWORD')) modifiers |= 8;
      }
      if (parent === 'CLASS' && parents.at(-1)?.children.some(n => n.kind === 'INTERFACE_KEYWORD')) type = 'interface';
      if (parent === 'CLASS' && !owner?.children.some(n => n.kind === 'INTERFACE_KEYWORD')) {
        if (flags.some(n => n.kind === 'ENUM_KEYWORD')) type = 'enum';
        else if (flags.some(n => n.kind === 'ANNOTATION_KEYWORD')) type = 'decorator';
      }
      if (parent === 'PROPERTY' && !['CLASS_BODY','KT_FILE','SCRIPT'].includes(container?.kind ?? '')) type = 'variable';
      if (parent === 'VALUE_PARAMETER' && owner?.children.some(n => ['VAL_KEYWORD','VAR_KEYWORD'].includes(n.kind))) type = 'property';
      if (parent === 'FUN' && container?.kind === 'CLASS_BODY') type = 'method';
      if (parent === 'LABEL') type = 'label';
      if (!type) {
        if (parents.some(p => p.kind === 'VALUE_ARGUMENT_NAME')) type = 'parameter';
        else if (parents.some(p => ['PACKAGE_DIRECTIVE', 'IMPORT_DIRECTIVE'].includes(p.kind))) type = 'namespace';
        else if (parents.some(p => p.kind === 'USER_TYPE')) type = parents.some(p => p.kind === 'CONSTRUCTOR_CALLEE') && parents.some(p => p.kind === 'ANNOTATION_ENTRY') ? 'decorator' : 'type';
        else if (parents.at(-2)?.kind === 'CALL_EXPRESSION') type = 'function';
        else type = 'variable';
      }
    } else if (parent === 'OPERATION_REFERENCE' || ['EQ', 'ARROW', 'COLONCOLON', 'SAFE_ACCESS'].includes(kind)) type = 'operator';
    if (type) output.push({ start: node.start, end: node.end, type: tokenTypes.indexOf(type), modifiers: modifiers | (declaration ? 1 : 0) });
  }
  visit(tree, []); return output;
}

