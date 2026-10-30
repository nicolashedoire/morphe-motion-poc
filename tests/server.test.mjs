import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApiMiddleware, parseModelEnvelope } from '../server/planner.mjs';
import { DEFAULT_SCENE } from '../src/domain.ts';

const sceneEnvelope = { kind: 'scene', plan: DEFAULT_SCENE, targetAngle: null, summary: 'A robot carries a box.', warnings: [], message: '' };
const providerResponse = (envelope = sceneEnvelope) => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(envelope) }] }] }) });

async function fixture(t, options = {}) {
  const middleware = createApiMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return {
    origin,
    get: (path) => fetch(origin + path),
    post: (body = { prompt: 'A robot carries a box', currentScene: DEFAULT_SCENE }, headers = {}) => fetch(origin + '/api/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  };
}

test('status is explicit when no key exists, and unavailable mode never invokes a provider', async t => {
  const app = await fixture(t, { fetchImpl: () => { throw new Error('Must not fetch'); } });
  assert.deepEqual(await (await app.get('/api/status')).json(), { available: false, provider: null, model: null });
  const res = await app.post();
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /No language model/);
});

test('status exposes configured provider/model, never its key', async t => {
  const app = await fixture(t, { apiKey: 'secret-test-key', model: 'test-model' });
  const res = await app.get('/api/status');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { available: true, provider: 'openai', model: 'test-model' });
  assert.equal((await app.get('/unknown')).status, 404);
  assert.equal((await app.get('/api/plan')).status, 405);
});

test('cross-origin requests and invalid client inputs cannot reach the key-bearing upstream', async t => {
  let calls = 0;
  const app = await fixture(t, { apiKey: 'secret', fetchImpl: async () => { calls++; return providerResponse(); } });
  assert.equal((await app.post(undefined, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await app.post(undefined, { Origin: '' })).status, 403);
  assert.equal((await app.post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
  for (const input of ['{', {}, { prompt: '' }, { prompt: 'a'.repeat(1201) }, { prompt: 'a', instructions: 'escape' }, { prompt: 'carry', currentScene: { ...DEFAULT_SCENE, actor: 'dragon' } }]) {
    assert.equal((await app.post(input)).status, 400);
  }
  assert.equal((await app.post(' '.repeat(17000))).status, 413);
  assert.equal(calls, 0);
});

test('valid provider plan is strictly validated and returned in the browser contract', async t => {
  let observed;
  const app = await fixture(t, { apiKey: 'secret', model: 'configured-model', fetchImpl: async (url, options) => { observed = { url, options }; return providerResponse(); } });
  const res = await app.post();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kind: 'scene', plan: DEFAULT_SCENE, summary: sceneEnvelope.summary, warnings: [] });
  assert.equal(observed.url, 'https://api.openai.com/v1/responses');
  assert.equal(observed.options.headers.Authorization, 'Bearer secret');
  const body = JSON.parse(observed.options.body);
  assert.equal(body.model, 'configured-model');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(JSON.parse(body.input).currentScene.actor, 'biped');
});

test('provider correction and unsupported intent have explicit output contracts', () => {
  assert.deepEqual(parseModelEnvelope({ kind: 'correction', plan: null, targetAngle: 0, summary: 'Keep level.', warnings: [], message: '' }), {
    kind: 'correction', targetAngle: 0, summary: 'Keep level.', warnings: [],
  });
  assert.deepEqual(parseModelEnvelope({ kind: 'unsupported', plan: null, targetAngle: null, summary: '', warnings: [], message: 'Flying is unsupported.' }), {
    kind: 'unsupported', message: 'Flying is unsupported.',
  });
  assert.throws(() => parseModelEnvelope({ ...sceneEnvelope, extra: 'injected' }));
  assert.throws(() => parseModelEnvelope({ ...sceneEnvelope, plan: { ...DEFAULT_SCENE, actor: 'dragon' } }));
  assert.throws(() => parseModelEnvelope({ kind: 'correction', plan: null, targetAngle: 0.2, summary: 'Rotate.', warnings: [], message: '' }));
});

test('provider errors, refusals, malformed and incomplete output never silently fall back', async t => {
  const cases = [
    { expected: 502, response: { ok: false, json: async () => ({ error: 'secret-provider-details' }) } },
    { expected: 502, response: { ok: true, json: async () => ({ status: 'incomplete', output: [] }) } },
    { expected: 422, response: { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'private text' }] }] }) } },
    { expected: 502, response: providerResponse({ ...sceneEnvelope, plan: { ...DEFAULT_SCENE, actor: 'dragon' } }) },
    { expected: 502, response: { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] }) } },
    { expected: 502, response: { ok: true, json: async () => ({ output: [] }) } },
  ];
  for (const c of cases) {
    const app = await fixture(t, { apiKey: 'secret-test-key', fetchImpl: async () => c.response });
    const res = await app.post();
    assert.equal(res.status, c.expected);
    const json = await res.json();
    assert.equal(typeof json.error, 'string');
    assert.equal('plan' in json, false);
    assert.doesNotMatch(JSON.stringify(json), /secret|private/);
  }
});

test('timeouts produce a clear error, without leaking upstream details', async t => {
  const app = await fixture(t, { apiKey: 'secret', fetchImpl: async () => { throw Object.assign(new Error('secret timeout detail'), { name: 'TimeoutError' }); } });
  const res = await app.post();
  assert.equal(res.status, 504);
  assert.match((await res.json()).error, /timed out/);
});

test('only one upstream request runs at a time and the slot is released', async t => {
  let release;
  let entered;
  let calls = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const app = await fixture(t, { apiKey: 'secret', fetchImpl: async () => { calls++; entered(); await gate; return providerResponse(); } });
  const first = app.post();
  await started;
  assert.equal((await app.post()).status, 429);
  assert.equal(calls, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await app.post()).status, 200);
  assert.equal(calls, 2);
});
