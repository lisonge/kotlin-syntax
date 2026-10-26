import { spawnSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let executable = process.env.VSCODE_EXECUTABLE_PATH;
if (!executable && process.platform === 'win32') {
  const found = spawnSync('where.exe', ['code'], { encoding: 'utf8' });
  const cli = found.stdout?.trim().split(/\r?\n/).find(p => p.endsWith('code.cmd'));
  if (cli) executable = resolve(dirname(cli), '../Code.exe');
}
if (!executable) throw new Error('Set VSCODE_EXECUTABLE_PATH to a VS Code executable');
await mkdir(resolve(root, 'build'), { recursive: true });
await rm(resolve(root, 'build/host-result.json'), { force: true });
const profile = await mkdtemp(resolve(root, 'build/test-host-'));
const env: NodeJS.ProcessEnv = { ...process.env, VSCODE_PORTABLE: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VSCODE_IPC_HOOK_CLI;
let developmentPath = root;
const vsix = process.env.VSCODE_TEST_VSIX;
if (process.env.VSCODE_TEST_STABLE_PRESENT === '1') {
  const fixture = resolve(profile, 'extensions/lisonge.kotlin-vscode-0.0.1');
  await mkdir(fixture, { recursive: true });
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify({
    name: 'kotlin-vscode', publisher: 'lisonge', version: '0.0.1',
    engines: { vscode: '^1.117.0' }, main: './index.js', activationEvents: [],
  }));
  await writeFile(resolve(fixture, 'index.js'), 'exports.activate = () => {};');
}
if (vsix) {
  const base = dirname(executable);
  const candidates = [resolve(base, 'resources/app/out/cli.js'), ...(await readdir(base, {withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>resolve(base,e.name,'resources/app/out/cli.js'))];
  let cli: string | undefined;
  for (const candidate of candidates) { try { await access(candidate); cli = candidate; break; } catch {} }
  if (!cli) throw new Error('Cannot locate the VS Code CLI next to its executable');
  const installed = spawnSync(executable, [cli, '--install-extension', resolve(vsix), '--force', '--user-data-dir', resolve(profile,'user-data'), '--extensions-dir', resolve(profile,'extensions')], {env:{...env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:120_000});
  if (installed.error || installed.status !== 0) throw new Error(`VSIX install failed: ${installed.error ?? installed.stderr}`);
  console.log(installed.stdout);
  // A separate empty development extension hosts the test runner. The target is installed normally.
  developmentPath = resolve(profile,'harness');
  await mkdir(developmentPath,{recursive:true});
  await writeFile(resolve(developmentPath,'package.json'), JSON.stringify({name:'vsix-test-harness',publisher:'local',version:'0.0.1',engines:JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).engines}));
  env.VSCODE_EXPECT_INSTALLED = '1';
  env.VSCODE_EXPECT_EXTENSIONS_DIR = resolve(profile,'extensions');
}
const logPath = resolve(root, 'build/host.log');
if (process.env.VSCODE_TEST_WORKSPACE === '1') {
  env.VSCODE_TEST_WORKSPACE = resolve(profile, 'workspace');
  await mkdir(env.VSCODE_TEST_WORKSPACE, { recursive: true });
}
const log = createWriteStream(logPath);
const child = spawn(executable, [
  '--extensionDevelopmentPath=' + developmentPath, '--extensionTestsPath=' + resolve(root, 'test/host.ts'),
  '--user-data-dir=' + resolve(profile, 'user-data'), '--extensions-dir=' + resolve(profile, 'extensions'),
  ...(process.env.VSCODE_TEST_STABLE_DISABLED === '1' ? ['--disable-extension=lisonge.kotlin-vscode'] : []),
  ...(vsix ? [] : ['--disable-extensions']), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
  ...(env.VSCODE_TEST_WORKSPACE ? [env.VSCODE_TEST_WORKSPACE] : []),
], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
const timer = setTimeout(() => child.kill(), 120_000);
try {
  const status = await new Promise<number | null>((accept, reject) => { child.on('close', accept); child.on('error', reject); });
  if (status !== 0) throw new Error(`VS Code test host exited with ${status}; see ${logPath}`);
  const result = JSON.parse(await readFile(resolve(root, 'build/host-result.json'), 'utf8'));
  if (!result.passed) throw new Error('Extension host verification failed');
  console.log(result);
} finally { clearTimeout(timer); log.end(); }
