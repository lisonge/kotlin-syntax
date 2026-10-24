import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { tokenModifiers, tokenTypes } from 'kotlin-parser/shared';
import { tokenStyle } from './token-theme.ts';
import { KotlinEditor } from './editor.tsx';
import './tailwind.css';
import './style.css';

const legend = tokenTypes.map(type => ({ type, style: tokenStyle(type) }));

function App() {
  return <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 py-7 md:px-12 md:py-10">
    <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-7">
      <div className="flex items-center gap-3"><span className="logo">K</span><span className="text-lg font-semibold tracking-tight">kotlin<span className="font-normal text-slate-500"> / playground</span></span></div>
      <a className="text-sm text-slate-400 hover:text-white" href="https://github.com/lisonge/kotlin-syntax" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
    </header>
    <section className="flex flex-wrap items-end justify-between gap-6 py-9">
      <div><p className="mb-3 text-xs tracking-[.22em] text-[#c678dd]">KOTLIN SYNTAX EXPLORER</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">See Kotlin in color.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Edit Kotlin and explore live syntax highlighting. Everything runs locally in your browser.</p></div>
      <span className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300"><span className="mr-2 text-[#98c379]">●</span>One Dark Pro</span>
    </section>
    <KotlinEditor />
    <section aria-label="Token legend" className="py-6 text-xs text-slate-400">
      <div className="mb-4 flex flex-wrap justify-between gap-3"><h2 className="font-semibold text-slate-200">All {tokenTypes.length} token types</h2><span>Shared with the Kotlin Syntax VS Code extension</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{legend.map(({ type, style }) => <span key={type} className="rounded border border-white/5 bg-[#282c34] px-3 py-2 font-mono" style={style}>● {type}</span>)}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><h3 className="text-slate-200">{tokenModifiers.length} modifiers</h3>{tokenModifiers.map(modifier => <code key={modifier} className="rounded border border-white/10 px-2 py-1">{modifier}</code>)}</div>
      <p className="mt-3 leading-6">Types can share a color. Modifiers affect styling only when the theme defines a matching rule.</p>
    </section>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-white/10 py-5 text-xs leading-6 text-slate-500"><p>Syntax highlighting only · No type checking or symbol resolution</p><p><a className="text-slate-400 hover:text-white" href="https://github.com/Binaryify/OneDark-Pro" target="_blank" rel="noopener noreferrer">One Dark Pro</a> · Official theme rules with VS Code semantic scope defaults</p></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

