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
delete manifest.dependencies;
delete manifest.devDependencies;
await writeFile(new URL('package.json', destination), JSON.stringify(manifest, null, 2) + '\n');
await rm(new URL('dist', destination), { recursive: true, force: true });
for (const name of ['dist', 'media', 'language-configuration.json', 'README.md', 'CHANGELOG.md', 'LICENSE', '.vscodeignore']) {
  await cp(new URL(name, root), new URL(name, destination), { recursive: true });
}
const output = fileURLToPath(new URL('../build/kotlin-syntax-dev.vsix', import.meta.url));
console.log(`Prepared development extension: ${manifest.publisher}.${manifest.name}\nVSIX destination: ${output}`);
