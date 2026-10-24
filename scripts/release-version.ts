import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../kotlin-vscode/package.json', import.meta.url), 'utf8'));
const tag = process.env.RELEASE_TAG;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
  throw new Error(`Release tag must match extension version: expected v${version}, received ${tag}`);
}
console.log(`Validated release ${tag}`);
