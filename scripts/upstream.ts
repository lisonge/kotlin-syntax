import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type Source = { path: string; sha256: string };
type Pin = { repository: string; revision: string; referenceSources: Source[] };
export type Component = 'parser' | 'ktfmt' | 'google-java-format' | 'ktfmt-cases';
export const parserMetadata = JSON.parse(await readFile(new URL('../kotlin-parser/upstream/metadata.json', import.meta.url), 'utf8')) as {
  repository: string; commit: string; version: string; lexerPath: string; lexerSha256: string;
  parserSources: Source[]; referenceSources: Source[];
};
const formatMetadata = JSON.parse(await readFile(new URL('../kotlin-format/upstream/metadata.json', import.meta.url), 'utf8')) as {
  ktfmt: Pin & { casesPath: string }; googleJavaFormat: Pin; files: Record<string, string>;
};
const hash = (text: string) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
async function exists(path: URL): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Fixed commits and file checksums define the cache; production builds never call this. */
export async function syncUpstream(component: Component): Promise<URL> {
  const pin = component === 'parser' ? { repository: parserMetadata.repository, revision: parserMetadata.commit }
    : component === 'google-java-format' ? formatMetadata.googleJavaFormat : formatMetadata.ktfmt;
  if (!/^[a-f0-9]{40}$/.test(pin.revision)) throw new Error('Expected a full upstream commit ID');
  const cases = component === 'ktfmt-cases';
  const sources: Source[] = component === 'parser' ? [
    { path: parserMetadata.lexerPath, sha256: parserMetadata.lexerSha256 },
    ...parserMetadata.parserSources, ...parserMetadata.referenceSources,
  ] : cases ? Object.entries(formatMetadata.files).map(([path, sha256]) => ({ path, sha256 }))
    : component === 'ktfmt' ? formatMetadata.ktfmt.referenceSources : formatMetadata.googleJavaFormat.referenceSources;
  if (!sources.length || sources.some(({ path }) => path.startsWith('/') || path.split('/').some(part => !part || part === '..'))) {
    throw new Error('Expected a nonempty manifest of relative upstream paths');
  }
  const cache = new URL(`../build/upstream/${cases ? 'ktfmt' : component}/${pin.revision}/`, import.meta.url);
  const destination = new URL(cases ? 'cases/' : 'sources/', cache);
  const missing: Source[] = [];
  for (const entry of sources) {
    const file = new URL(entry.path, destination);
    if (!await exists(file)) { missing.push(entry); continue; }
    if (hash(await readFile(file, 'utf8')) !== entry.sha256) {
      throw new Error(`Upstream checksum mismatch: ${fileURLToPath(file)}. Remove this cached file and rerun to restore it.`);
    }
  }
  if (!missing.length) {
    console.log(`Using ${sources.length} verified cached ${component} files at ${pin.revision}.`);
    return destination;
  }
  const repo = new URL(pin.repository).pathname.replace(/^\//, '');
  async function save(entry: Source, text: string) {
    if (hash(text) !== entry.sha256) throw new Error(`Downloaded upstream checksum mismatch: ${entry.path}`);
    const file = new URL(entry.path, destination);
    await mkdir(new URL('./', file), { recursive: true });
    await writeFile(file, text.replaceAll('\r\n', '\n'));
  }
  if (cases) {
    // One archive avoids hundreds of HTTP requests for the test corpus.
    await mkdir(cache, { recursive: true });
    const archive = new URL('source.tar.gz', cache);
    if (!await exists(archive)) {
      console.log(`Downloading ${component} at ${pin.revision}…`);
      await writeFile(archive, await download(`https://codeload.github.com/${repo}/tar.gz/${pin.revision}`));
    }
    const temporary = await mkdtemp(fileURLToPath(new URL('extract-', cache)));
    try {
      const prefix = `ktfmt-${pin.revision}/${formatMetadata.ktfmt.casesPath}`;
      const result = spawnSync('tar', ['-xzf', fileURLToPath(archive), '-C', temporary, prefix], { stdio: 'inherit', windowsHide: true });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Cannot extract ${fileURLToPath(archive)}; remove the cached archive and retry.`);
      for (const entry of missing) await save(entry, await readFile(`${temporary}/${prefix}/${entry.path}`, 'utf8'));
    } finally { await rm(temporary, { recursive: true, force: true }); }
  } else {
    // Fetch selected files only, particularly for the large Kotlin repository.
    console.log(`Downloading ${missing.length} ${component} source files at ${pin.revision}…`);
    for (let i = 0; i < missing.length; i += 6) {
      await Promise.all(missing.slice(i, i + 6).map(async entry => {
        const data = await download(`https://raw.githubusercontent.com/${repo}/${pin.revision}/${entry.path}`);
        await save(entry, new TextDecoder().decode(data));
      }));
    }
  }
  console.log(`Prepared ${sources.length} verified ${component} files in ${fileURLToPath(destination)}.`);
  return destination;
}
