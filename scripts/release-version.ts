import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../kotlin-vscode/package.json', import.meta.url), 'utf8'));
const tag = process.env.RELEASE_TAG;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
  throw new Error(`Release tag must match extension version: expected v${version}, received ${tag}`);
}
const changelog = readFileSync(new URL('../kotlin-vscode/CHANGELOG.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const headings = changelog.match(/^## .+$/gm) ?? [];
if (!changelog.startsWith("# What's Changed\n") || headings.length !== 1 || headings[0] !== `## ${version}` || !/^[-*] \S/m.test(changelog)) {
  throw new Error(`CHANGELOG.md must have title # What's Changed, only ## ${version}, and nonempty change entries`);
}
console.log(`Validated release ${tag} and its current-version changelog`);
