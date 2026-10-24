export interface Case { source: string; expected: [string, string, number][] }
// Hand-authored expectations, independent of the tree classifier.
export const cases: Case[] = [
  { source: 'enum class Mode { ON }', expected: [['Mode','enum',1],['ON','enumMember',1]] },
  { source: 'abstract class Base { abstract suspend fun run() }', expected: [['Base','class',5],['run','method',13]] },
  { source: 'class Box(val value: Int, var count: Int) { val fixed = 1; var changing = 2 }', expected: [['value','property',3],['count','property',1],['fixed','property',3],['changing','property',1]] },
  { source: 'fun outer() { val local = 1; class Inner { val member = 2; fun method() {} } }', expected: [['local','variable',3],['member','property',3],['method','method',1]] },
  { source: 'suspend fun String.ext() = this', expected: [['ext','function',9],['String','type',0]] },
  { source: 'annotation class Mark\n@Mark val value = 1', expected: [['Mark','decorator',1],['value','property',3]] },
  { source: 'fun f() { loop@ while (true) { break@loop } }', expected: [['loop','label',0]] },
  { source: '/** docs */ val answer = 42', expected: [['/** docs */','comment',16],['answer','property',3],['42','number',0]] },
  { source: 'class Broken(val value: Int', expected: [['Broken','class',1],['value','property',3],['Int','type',0]] },
  { source: 'fun unfinished(arg: String) { val local = "hello', expected: [['unfinished','function',1],['arg','parameter',1],['local','variable',3],['hello','string',0]] },
  { source: 'val broken =\nval healthy = 42', expected: [['broken','property',3],['healthy','property',3],['42','number',0]] },
  { source: '@Anno(value = thing as Type) class C', expected: [['Anno','decorator',0],['Type','type',0]] },
  { source: 'var change = 1\r\nval text = "😀"\r\nfun broken(', expected: [['change','property',1],['text','property',3],['😀','string',0],['broken','function',1]] },
  { source: '/* unfinished 😀', expected: [['/* unfinished 😀','comment',0]] },
  { source: 'class C { suspend fun work(', expected: [['C','class',1],['work','method',9]] },
];
export const typing = ['val x', 'val x =', 'val x = "', 'val x = "😀', 'val x = "😀"', 'var x = "😀"', 'val x =', 'val x = 1'];
