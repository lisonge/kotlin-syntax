import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormatClient } from '../dist/format-client.js';
import { Worker } from 'node:worker_threads';
import type { TestContext } from 'node:test';

const input = { key: 'file:///cache.kt', source: 'val value=1', script: false, style: 'KOTLINLANG' as const, maxWidth: 100 };

test('project options reach the worker and invalidate cached formatting', async t => {
  const h = countedClient(t);
  const request = { ...input, source: 'import unused.Foo\nval value=1' };
  assert.equal(await h.client.request(request), 'val value = 1\n');
  const keep = { ...request, removeUnusedImports: false };
  assert.match((await h.client.request(keep))!, /import unused.Foo/);
  assert.equal(h.calls, 2);
  await h.client.request(keep);
  assert.equal(h.calls, 2);
  await h.client.request({ ...keep, preserveLambdaBreaks: false });
  assert.equal(h.calls, 3);
});
function countedClient(t: TestContext): { client: FormatClient; readonly calls: number; readonly starts: number } {
  let calls = 0, starts = 0;
  const client = new FormatClient(() => {
    starts++;
    const worker = new Worker(new URL('../dist/format-worker.js', import.meta.url));
    const send = worker.postMessage.bind(worker);
    worker.postMessage = (message, transferList) => { calls++; send(message, transferList); };
    return worker;
  });
  t.after(() => client.dispose());
  return { client, get calls() { return calls; }, get starts() { return starts; } };
}

test('memoizes actual input, including stable output; source and every option invalidate the cache', async t => {
  const h = countedClient(t);
  assert.equal(h.starts, 0);
  const formatted = await h.client.request(input);
  assert.equal(formatted, 'val value = 1\n');
  assert.equal(await h.client.request({ ...input }), formatted);
  assert.equal(h.calls, 1);
  const stable = { ...input, source: formatted! };
  assert.equal(await h.client.request(stable), formatted);
  assert.equal(h.calls, 2, 'output has not yet been verified as an input');
  assert.equal(await h.client.request(stable), formatted);
  assert.equal(h.calls, 2, 'stable repeated saves perform no worker call');
  const variants = [
    { ...stable, style: 'GOOGLE' as const },
    { ...stable, style: 'META' as const },
    { ...stable, style: 'META' as const, maxWidth: 40 },
    { ...stable, style: 'META' as const, maxWidth: 40, script: true },
    { ...stable, style: 'META' as const, maxWidth: 40, script: true, source: 'val value=2' },
  ];
  for (const request of variants) {
    const before: number = h.calls;
    const result = await h.client.request(request);
    assert.equal(h.calls, before + 1);
    assert.equal(await h.client.request(request), result);
    assert.equal(h.calls, before + 1);
  }
  const before = h.calls;
  await h.client.request(input);
  assert.equal(h.calls, before + 1, 'only the most recent pair is retained');
  assert.equal(h.starts, 1);
});

test('identical pending requests share one worker call, with independent cancellation', async t => {
  const h = countedClient(t);
  const controller = new AbortController();
  const first = h.client.request(input, controller.signal);
  const second = h.client.request(input);
  const third = h.client.request(input);
  assert.equal(h.calls, 1);
  controller.abort();
  assert.equal(await first, undefined);
  assert.deepEqual(await Promise.all([second, third]), ['val value = 1\n', 'val value = 1\n']);
  assert.equal(await h.client.request(input, controller.signal), undefined, 'pre-cancelled cache hit is discarded');
  assert.equal(h.calls, 1);

  const changed = { ...input, source: 'val value=2' };
  const a = new AbortController(), b = new AbortController();
  const pa = h.client.request(changed, a.signal), pb = h.client.request(changed, b.signal);
  assert.equal(h.calls, 2);
  a.abort(); b.abort();
  assert.deepEqual(await Promise.all([pa, pb]), [undefined, undefined]);
  assert.equal(await h.client.request(changed), 'val value = 2\n');
  assert.equal(h.calls, 3, 'fully cancelled work does not seed the cache');
});

test('document caches are independent and close/dispose release pending requests and cached results', async t => {
  const h = countedClient(t);
  const other = { ...input, key: 'file:///other.kt' };
  await h.client.request(input); await h.client.request(other);
  assert.equal(h.calls, 2);
  h.client.close(input.key);
  await h.client.request(other);
  assert.equal(h.calls, 2, 'closing another document preserves this cache');
  await h.client.request(input);
  assert.equal(h.calls, 3);
  const pending = h.client.request({ ...input, source: 'val value=2' });
  h.client.close(input.key);
  assert.equal(await pending, undefined);
  assert.equal(await h.client.request(input), 'val value = 1\n');
  assert.equal(h.calls, 5, 'reopening does not reuse the closed document');
  await h.client.request(input);
  assert.equal(h.calls, 5, 'late closed-document replies do not replace the new cache');
  const unfinished = h.client.request({ ...input, source: 'val value=3' });
  await h.client.dispose();
  assert.equal(await unfinished, undefined);
  await assert.rejects(h.client.request(input), /disposed/);
});

test('a shared earlier computation remains the latest request even if other work finishes later', async t => {
  const h = countedClient(t);
  const first = h.client.request(input);
  const different = h.client.request({ ...input, source: 'val value=2' });
  const latest = h.client.request(input);
  assert.equal(h.calls, 2);
  assert.deepEqual(await Promise.all([first, different, latest]), ['val value = 1\n', 'val value = 2\n', 'val value = 1\n']);
  await h.client.request(input);
  assert.equal(h.calls, 2);
});

test('format errors are not cached and shared worker failures can be retried', async t => {
  const h = countedClient(t);
  const invalid = { ...input, source: 'fun {' };
  for (let i = 1; i <= 2; i++) {
    await assert.rejects(h.client.request(invalid));
    assert.equal(h.calls, i);
  }
  let starts = 0;
  const client = new FormatClient(() => ++starts === 1
    ? new Worker('throw new Error("formatter startup failed")', { eval: true })
    : new Worker(new URL('../dist/format-worker.js', import.meta.url)));
  t.after(() => client.dispose());
  await Promise.all([
    assert.rejects(client.request(input), /formatter startup failed/),
    assert.rejects(client.request(input), /formatter startup failed/),
  ]);
  assert.equal(starts, 1);
  assert.equal(await client.request(input), 'val value = 1\n');
  assert.equal(starts, 2);
});

test('cache preserves real ktfmt non-idempotent second passes', async t => {
  const h = countedClient(t);
  const request = { ...input, maxWidth: 49, source: 'fun f() {\n  @Annotation // test a comment after annotations\n  return 5\n}' };
  const first = 'fun f() {\n    @Annotation // test a comment after\n                // annotations\n    return 5\n}\n';
  const second = 'fun f() {\n    @Annotation // test a comment after\n    // annotations\n    return 5\n}\n';
  assert.equal(await h.client.request(request), first);
  assert.equal(await h.client.request(request), first);
  assert.equal(h.calls, 1);
  assert.equal(await h.client.request({ ...request, source: first }), second);
  assert.equal(await h.client.request({ ...request, source: first }), second);
  assert.equal(h.calls, 2);
  assert.equal(await h.client.request({ ...request, source: second }), second);
  assert.equal(await h.client.request({ ...request, source: second }), second);
  assert.equal(h.calls, 3);
});

test('packaged formatter worker: styles, scripts, errors, cancellation and disposal', async () => {
  const client = new FormatClient();
  const request = { key: 'file:///test.kt', source: 'fun f(){println("😀")}', script: false, style: 'KOTLINLANG' as const, maxWidth: 100 };
  try {
    assert.equal(await client.request(request), 'fun f() {\n    println("😀")\n}\n');
    assert.equal(await client.request({ ...request, style: 'GOOGLE' }), 'fun f() {\n  println("😀")\n}\n');
    assert.equal(await client.request({ ...request, source: 'println(1+2)', script: true }), 'println(1 + 2)\n');
    await assert.rejects(client.request({ ...request, source: 'fun {' }));
    const controller = new AbortController();
    const cancelled = client.request(request, controller.signal); controller.abort();
    assert.equal(await cancelled, undefined);
    assert.equal(await client.request(request), 'fun f() {\n    println("😀")\n}\n');
    assert.equal(await client.request(request, controller.signal), undefined);
  } finally { await client.dispose(); }
  await assert.rejects(client.request(request), /disposed/);
});
