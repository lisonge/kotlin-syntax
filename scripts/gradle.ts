import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const args = process.argv.slice(2);
if (args.some(arg => !/^[\w:.=/-]+$/.test(arg))) throw new Error('Unsupported Gradle argument');
const child = spawn(windows ? 'cmd.exe' : 'sh', windows ? ['/d', '/c', 'gradlew.bat', ...args] : ['./gradlew', ...args], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
