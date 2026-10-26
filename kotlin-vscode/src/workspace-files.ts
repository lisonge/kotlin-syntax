import ignore, { type Ignore } from 'ignore';

export interface DirectoryAccess {
  entries(path: string): Promise<{ name: string; directory: boolean; file: boolean }[]>;
  ignoreFile(path: string): Promise<string | undefined>;
}
const excluded = new Set(['node_modules', 'build', 'dist']);
export const excludedWorkspaceDirectory = (name: string) => name.startsWith('.') || excluded.has(name);

/** Paths are relative to one workspace folder; ignored directories are never entered. */
export async function kotlinFiles(access: DirectoryAccess, cancelled: () => boolean, directories?: ReadonlySet<string>): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string, parents: { base: string; rules: Ignore }[]) {
    if (cancelled()) return;
    const text = await access.ignoreFile(directory);
    const layers = text === undefined ? parents : [...parents, { base: directory, rules: ignore().add(text) }];
    if (cancelled()) return;
    for (const entry of await access.entries(directory)) {
      if (cancelled()) return;
      if (entry.directory && excludedWorkspaceDirectory(entry.name)) continue;
      const path = directory + entry.name;
      let ignored = false;
      for (const layer of layers) {
        const match = layer.rules.test(path.slice(layer.base.length) + (entry.directory ? '/' : ''));
        if (match.ignored || match.unignored) ignored = match.ignored;
      }
      if (ignored) continue;
      if (entry.directory) {
        if (!directories || [...directories].some(target => target.startsWith(path + '/'))) await visit(path + '/', layers);
      } else if ((!directories || directories.has(directory)) && entry.file && entry.name.endsWith('.kt')) result.push(path);
    }
  }
  await visit('', []);
  return cancelled() ? [] : result;
}
