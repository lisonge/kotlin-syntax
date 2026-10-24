import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { tokenModifiers, tokenTypes } from '../../kotlin-vscode/src/highlights.ts';
import type { Request, Result } from './protocol.ts';
import { oneDarkPro } from './theme.ts';
import { tokenClass, tokenStyle } from './token-theme.ts';
import { sample } from './sample.ts';
import './style.css';

const highlight = StateEffect.define<DecorationSet>();
const highlighting = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(highlight)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

function App() {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const mode = useRef(false);
  const [script, setScript] = useState(false);
  const [status, setStatus] = useState('Loading parser…');
  const [error, setError] = useState(false);
  const [count, setCount] = useState(0);
  const [position, setPosition] = useState('Ln 1, Col 1');

  useEffect(() => {
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    let version = 0;
    let busy = false;
    let pending: Request | undefined;
    const send = () => {
      version++;
      pending = { version, source: view.state.doc.toString(), script: mode.current, moduleUrl: new URL(`${import.meta.env.BASE_URL}parser/kotlin-parser.mjs`, document.baseURI).href };
      setStatus('Highlighting…');
      if (!busy) { busy = true; worker.postMessage(pending); pending = undefined; }
    };
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({ doc: sample, extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), oneDarkPro, highlighting,
        EditorView.contentAttributes.of({ 'aria-label': 'Kotlin code editor', spellcheck: 'false' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) send();
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            setPosition(`Ln ${line.number}, Col ${head - line.from + 1}`);
          }
        }),
      ] }),
    });
    editor.current = view;
    refresh.current = send;
    worker.onmessage = ({ data }: MessageEvent<Result>) => {
      busy = false;
      if (data.version === version) {
        setError(!!data.error);
        if (data.error) {
          setStatus(`Parser unavailable. Use a modern browser with Wasm GC support. ${data.error}`);
          view.dispatch({ effects: highlight.of(Decoration.none) });
          setCount(0);
        } else {
          const spans = data.spans!;
          const ranges = [];
          for (let i = 0; i < spans.length; i += 4) {
            if (spans[i + 1] > spans[i]) ranges.push(Decoration.mark({ class: tokenClass(tokenTypes[spans[i + 2]], spans[i + 3]) }).range(spans[i], spans[i + 1]));
          }
          view.dispatch({ effects: highlight.of(Decoration.set(ranges, true)) });
          setCount(ranges.length);
          setStatus(`${data.elapsed!.toFixed(1)} ms`);
        }
      }
      if (pending) { busy = true; worker.postMessage(pending); pending = undefined; }
    };
    worker.onerror = () => { busy = false; setError(true); setStatus('Worker failed to load. Reload the page to retry.'); };
    send();
    return () => { worker.terminate(); view.destroy(); editor.current = null; refresh.current = null; };
  }, []);

  function reset() {
    const view = editor.current;
    if (view) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sample }, selection: { anchor: 0 } }); view.focus(); }
  }

  return <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 py-7 md:px-12 md:py-10">
    <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-7">
      <div className="flex items-center gap-3"><span className="logo">K</span><span className="text-lg font-semibold tracking-tight">kotlin<span className="font-normal text-slate-500"> / playground</span></span></div>
      <a className="text-sm text-slate-400 hover:text-white" href="https://github.com/lisonge/vscode-kotlin-syntax" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
    </header>
    <section className="flex flex-wrap items-end justify-between gap-6 py-9">
      <div><p className="mb-3 text-xs tracking-[.22em] text-[#c678dd]">KOTLIN SYNTAX EXPLORER</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">See Kotlin in color.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Edit Kotlin and explore live syntax highlighting. Everything runs locally in your browser.</p></div>
      <span className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300"><span className="mr-2 text-[#98c379]">●</span>One Dark Pro</span>
    </section>
    <section className="overflow-hidden rounded-xl border border-white/10 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#21252b] px-4 py-3">
        <div className="flex items-center gap-3"><span className="text-sm text-[#c678dd]">K</span><span className="font-mono text-sm">Playground.{script ? 'kts' : 'kt'}</span></div>
        <div className="flex items-center gap-3 text-xs"><label className="text-slate-400">Mode <select aria-label="Kotlin file mode" className="ml-2 rounded bg-[#282c34] px-2 py-1.5 text-slate-200" value={script ? 'script' : 'file'} onChange={event => { const next = event.target.value === 'script'; mode.current = next; setScript(next); refresh.current?.(); }}><option value="file">File .kt</option><option value="script">Script .kts</option></select></label><button className="rounded border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5" onClick={reset}>Reset example</button></div>
      </div>
      <div ref={container} className="h-[58vh] min-h-[360px]" />
      <div className="flex flex-wrap justify-between gap-3 border-t border-white/5 bg-[#21252b] px-4 py-2.5 font-mono text-xs text-slate-400"><span role="status" className={error ? 'text-red-300' : ''}>{error ? '● ' : '● WASM · '}{status}</span><span>{count} tokens <span className="mx-3 text-slate-600">|</span>{position}<span className="mx-3 text-slate-600">|</span>UTF-16</span></div>
    </section>
    <section aria-label="Token legend" className="py-6 text-xs text-slate-400">
      <div className="mb-4 flex flex-wrap justify-between gap-3"><h2 className="font-semibold text-slate-200">All {tokenTypes.length} token types</h2><span>Shared with the Kotlin Syntax VS Code extension</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{tokenTypes.map(type => <span key={type} className="rounded border border-white/5 bg-[#282c34] px-3 py-2 font-mono" style={tokenStyle(type)}>● {type}</span>)}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><h3 className="text-slate-200">{tokenModifiers.length} modifiers</h3>{tokenModifiers.map(modifier => <code key={modifier} className="rounded border border-white/10 px-2 py-1">{modifier}</code>)}</div>
      <p className="mt-3 leading-6">Types can share a color. Modifiers affect styling only when the theme defines a matching rule.</p>
    </section>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-white/10 py-5 text-xs leading-6 text-slate-500"><p>Syntax highlighting only · No type checking or symbol resolution</p><p><a className="text-slate-400 hover:text-white" href="https://github.com/Binaryify/OneDark-Pro" target="_blank" rel="noopener noreferrer">One Dark Pro</a> · Official theme rules with VS Code semantic scope defaults</p></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

