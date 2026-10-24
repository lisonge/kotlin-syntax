import { useEffect, useRef, useState } from 'react';
import { type ChangeSet, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { tokenTypes } from 'kotlin-parser/shared';
import type { Edit, Request, Result } from './protocol.ts';
import { oneDarkPro } from './theme.ts';
import { tokenClass } from './token-theme.ts';
import { sample } from './sample.ts';

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

export function KotlinEditor() {
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
    let pending: ChangeSet | undefined;
    let sentVersion = 0;
    let sync = true;
    const send = () => {
      if (busy || (!sync && !pending)) return;
      let request: Request;
      if (sync) {
        request = { kind: 'sync', version, source: view.state.doc.toString(), script: mode.current };
      } else {
        const edits: Edit[] = [];
        pending!.iterChanges((start, end, _from, _to, text) => edits.push({ start, end, text: text.toString() }));
        request = { kind: 'edit', baseVersion: sentVersion, version, edits: edits.reverse() };
      }
      busy = true; sync = false; pending = undefined; sentVersion = version;
      setStatus('Highlighting…');
      worker.postMessage(request);
    };
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({ doc: sample, extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), oneDarkPro, highlighting,
        EditorView.contentAttributes.of({ 'aria-label': 'Kotlin code editor', spellcheck: 'false' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            version++;
            if (!sync) pending = pending ? pending.compose(update.changes) : update.changes;
            send();
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            setPosition(`Ln ${line.number}, Col ${head - line.from + 1}`);
          }
        }),
      ] }),
    });
    editor.current = view;
    refresh.current = () => { version++; sync = true; pending = undefined; send(); };
    worker.onmessage = ({ data }: MessageEvent<Result>) => {
      busy = false;
      if ('resync' in data) {
        sync = true; pending = undefined; send(); return;
      }
      if ('error' in data) { sync = true; pending = undefined; }
      if (data.version === version) {
        setError('error' in data);
        if ('error' in data) {
          setStatus(`Parser unavailable. Use a modern browser with Wasm GC support. ${data.error}`);
          view.dispatch({ effects: highlight.of(Decoration.none) });
          setCount(0);
        } else {
          const spans = data.spans;
          const ranges = [];
          for (let i = 0; i < spans.length; i += 4) {
            if (spans[i + 1] > spans[i]) ranges.push(Decoration.mark({ class: tokenClass(tokenTypes[spans[i + 2]], spans[i + 3]) }).range(spans[i], spans[i + 1]));
          }
          view.dispatch({ effects: highlight.of(Decoration.set(ranges, true)) });
          setCount(ranges.length);
          setStatus(`${data.elapsed.toFixed(1)} ms`);
        }
      }
      // Retry errors only after another edit; mismatches request an immediate snapshot.
      if (!('error' in data) || data.version !== version) send();
    };
    worker.onerror = () => { busy = false; setError(true); setStatus('Worker failed to load. Reload the page to retry.'); };
    send();
    return () => { worker.terminate(); view.destroy(); editor.current = null; refresh.current = null; };
  }, []);

  function reset() {
    const view = editor.current;
    if (view) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sample }, selection: { anchor: 0 } }); view.focus(); }
  }

  return <section className="overflow-hidden rounded-xl border border-white/10 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#21252b] px-4 py-3">
        <div className="flex items-center gap-3"><span className="text-sm text-[#c678dd]">K</span><span className="font-mono text-sm">Playground.{script ? 'kts' : 'kt'}</span></div>
        <div className="flex items-center gap-3 text-xs"><label className="text-slate-400">Mode <select aria-label="Kotlin file mode" className="ml-2 rounded bg-[#282c34] px-2 py-1.5 text-slate-200" value={script ? 'script' : 'file'} onChange={event => { const next = event.target.value === 'script'; mode.current = next; setScript(next); refresh.current?.(); }}><option value="file">File .kt</option><option value="script">Script .kts</option></select></label><button className="rounded border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5" onClick={reset}>Reset example</button></div>
      </div>
      <div ref={container} className="h-[58vh] min-h-[360px]" />
      <div className="flex flex-wrap justify-between gap-3 border-t border-white/5 bg-[#21252b] px-4 py-2.5 font-mono text-xs text-slate-400"><span role="status" className={error ? 'text-red-300' : ''}>{error ? '● ' : '● WASM · '}{status}</span><span>{count} tokens <span className="mx-3 text-slate-600">|</span>{position}<span className="mx-3 text-slate-600">|</span>UTF-16</span></div>
    </section>;
}
