import { readFileSync } from 'node:fs';

export function validateReleaseVersions(extension: string, formatter: string, parser: string, tag: string | undefined): void {
  if (!/^\d+\.\d+\.\d+$/.test(extension) || formatter !== extension || parser !== extension || tag !== `v${extension}`) {
    throw new Error(`Release versions must match: extension=${extension}, formatter=${formatter}, parser=${parser}, tag=${tag}; expected all packages at ${extension} and tag v${extension}`);
  }
}

if (import.meta.main) {
  const extension = JSON.parse(readFileSync(new URL('../kotlin-vscode/package.json', import.meta.url), 'utf8'));
  const formatter = JSON.parse(readFileSync(new URL('../kotlin-format/package.json', import.meta.url), 'utf8'));
  const parser = JSON.parse(readFileSync(new URL('../kotlin-parser/package.json', import.meta.url), 'utf8'));
  validateReleaseVersions(extension.version, formatter.version, parser.version, process.env.RELEASE_TAG);
  if (formatter.private) throw new Error('kotlin-format must not be private for npm publishing');
  if (parser.private) throw new Error('kotlin-parser must not be private for npm publishing');
  console.log(`Validated release v${extension.version} for VSIX, kotlin-format and kotlin-parser`);
}
