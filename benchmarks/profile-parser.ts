import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as parser from '../kotlin-vscode/dist/parser/kotlin-parser.mjs';
import { outputDirectory } from './output.ts';
const directory = await outputDirectory();
let source = 'package benchmark\n';
for (let i=0;source.length<102400;i++) source += `/** item ${i} */\nclass Box${i}(val value: Int) { fun compute(x: Int): Int = value + x }\n`;
const result = [];
for (let i=0;i<5;i++) {
  let start=performance.now(); const tokens=parser.tokenize(source); const lexer=performance.now()-start;
  start=performance.now(); const id=parser.openDocument(source,false); const parse=performance.now()-start;
  start=performance.now(); const tree=parser.documentTree(id); const serialize=performance.now()-start;
  start=performance.now(); const spans=parser.documentHighlights(id); const highlight=performance.now()-start;
  result.push({lexerIncludingJsonMs:lexer,parseIncludingLexerMs:parse,treeJsonMs:serialize,highlightMs:highlight,treeBytes:Buffer.byteLength(tree),spanBytes:Buffer.byteLength(spans)});
  parser.closeDocument(id);
}
await writeFile(new URL(`stages-${process.argv[2]??'before'}.json`,directory),JSON.stringify(result,null,2));
console.log(result);
