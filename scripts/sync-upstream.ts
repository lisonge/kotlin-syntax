import { syncUpstream, type Component } from './upstream.ts';

const components: Component[] = ['parser', 'ktfmt', 'google-java-format', 'ktfmt-cases'];
const requested = process.argv.slice(2);
if (!requested.length || requested.some(name => name !== 'all' && !components.includes(name as Component))) {
  throw new Error(`Usage: pnpm upstream:sync <${components.join('|')}|all>`);
}
for (const component of new Set(requested.includes('all') ? components : requested as Component[])) {
  await syncUpstream(component);
}
