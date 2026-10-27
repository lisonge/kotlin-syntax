import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('../build/dev-extension/', import.meta.url);
await mkdir(destination, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
manifest.name += '-dev';
manifest.displayName += ' Dev';
for (const command of manifest.contributes.commands) {
  command.command = command.command.replace('kotlinSyntax.', 'kotlinSyntaxDev.');
  command.title = command.title.replace('Kotlin Syntax:', 'Kotlin Syntax Dev:');
}
delete manifest.scripts;
await writeFile(new URL('package.json', destination), JSON.stringify(manifest, null, 2) + '\n');
await rm(new URL('dist', destination), { recursive: true, force: true });
for (const name of ['dist', 'media', 'language-configuration.json', 'README.md', 'LICENSE', '.vscodeignore']) {
  await cp(new URL(name, root), new URL(name, destination), { recursive: true });
}
await cp(new URL('../CHANGELOG.md', root), new URL('CHANGELOG.md', destination));
console.log(`Prepared development extension: ${manifest.publisher}.${manifest.name}\nStaging directory: ${fileURLToPath(destination)}`);
