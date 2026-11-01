import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.mjs';

const input = { apiKey: 'test-key-not-real', model: 'gemini-4-argon', product: '单向历', sellingPoints: '小鸭插画', audience: '青年', count: 1, targetLength: 135, features: ['有情绪'], extra: '' };
async function start(t, options = {}) {
  const app = createApp(options);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.close(resolve); app.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { base, post: (data = input, options = {}) => fetch(`${base}/api/generate`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...options }) };
}
test('本地页面、资源和健康检查正常，私有文件不可访问', async t => {
  const { base } = await start(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /填入单向历范例/);
  for (const path of ['/styles.css', '/app.js', '/api/health']) assert.equal((await fetch(base + path)).status, 200);
  for (const path of ['/server.mjs', '/.git/config', '/README.md', '/missing']) assert.equal((await fetch(base + path)).status, 404);
});
test('完整生成返回结构化结果及字符数', async t => {
  const { post } = await start(t, { fetchImpl: async () => Response.json({ choices: [{ message: { content: '{"copies":[{"focus":"每日鼓励","text":"今天，也要相信自己。"}]}' } }] }) });
  const response = await post(); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.copies[0].characterCount, 10);
  assert.equal(data.model, input.model);
});
test('拒绝跨域、错误 Host、不正确的 Content-Type 和坏 JSON', async t => {
  let calls = 0;
  const { base, post } = await start(t, { fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  assert.equal((await post(input, { headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await post(input, { headers: { Origin: base, 'Content-Type': 'text/plain' } })).status, 403);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/generate`, { method: 'POST', headers: { Origin: base, Host: 'other.example', 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end(JSON.stringify(input));
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await post(input, { body: 'bad json' })).status, 400);
  assert.equal((await post({ ...input, apiKey: '' })).status, 400);
  assert.equal(calls, 0);
});
test('超时终止上游请求，并返回 TIMEOUT', async t => {
  let aborted = false;
  const { post } = await start(t, { timeoutMs: 30, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
  }) });
  const response = await post(); assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'TIMEOUT'); assert.equal(aborted, true);
});
test('用户取消连接时也终止上游请求', async t => {
  let announceStarted, announceAborted;
  const started = new Promise(resolve => { announceStarted = resolve; });
  const aborted = new Promise(resolve => { announceAborted = resolve; });
  const { post } = await start(t, { fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { announceAborted(); reject(signal.reason); }, { once: true }); announceStarted();
  }) });
  const controller = new AbortController();
  const request = post(input, { signal: controller.signal });
  const rejection = assert.rejects(request, { name: 'AbortError' });
  await started; controller.abort(); await rejection;
  await Promise.race([aborted, new Promise((_resolve, reject) => { const timer = setTimeout(() => reject(new Error('上游没有取消')), 1000); timer.unref(); })]);
});
test('网络异常不会返回错误栈或 Key', async t => {
  const { post } = await start(t, { fetchImpl: async () => { throw new Error(`secret: ${input.apiKey}`); } });
  const response = await post(); assert.equal(response.status, 502);
  const body = await response.text(); assert.match(body, /NETWORK/); assert.ok(!body.includes(input.apiKey));
});
