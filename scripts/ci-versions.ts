import { readFileSync, appendFileSync } from 'node:fs';
const { devEngines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error('GITHUB_OUTPUT is required');
appendFileSync(output, `node=${devEngines.runtime.version}\npnpm=${devEngines.packageManager.version}\n`);
