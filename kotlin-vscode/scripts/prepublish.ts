import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp } from 'node:fs/promises';

if (process.env.KOTLIN_VSCODE_SKIP_BUILD === '1') {
  console.log('Using existing build artifacts for VSIX packaging.');
} else {
  for (const script of ['../../kotlin-parser/scripts/build.ts', '../../kotlin-format/scripts/build.ts', './build.ts']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
await cp(new URL('../../CHANGELOG.md', import.meta.url), new URL('../dist/CHANGELOG.md', import.meta.url));
