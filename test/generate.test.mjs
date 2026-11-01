import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, validateInput, buildMessages, parseCopies, countCharacters, upstreamError } from '../lib/generate.mjs';

export const input = { apiKey: 'test-key-not-real', model: 'gemini-4-argon', product: '2027 年单向历', sellingPoints: '每日一幅小鸭插画，一句鼓励自我的文案', audience: '小镇青年和 Z 世代', count: 5, targetLength: 135, features: ['有网感', '有情绪', '卖点突出'], extra: '开头不同' };
const content = JSON.stringify({ copies: Array.from({ length: 5 }, (_, i) => ({ focus: `角度${i}`, text: '给今天的自己一点鼓励。' })) });

test('字数统计忽略空白、保留标点，emoji 计为一个 Unicode 字符', () => {
  assert.equal(countCharacters('小鸭，\n 自信！ 🦆'), 7);
});
test('验证必填项、篇数、长度、特点和输入边界', () => {
  assert.equal(validateInput(input).count, 5);
  for (const patch of [{ apiKey: '' }, { model: '' }, { product: '' }, { sellingPoints: '' }, { audience: '' }, { count: 0 }, { count: 11 }, { count: 1.5 }, { count: '5' }, { targetLength: 49 }, { targetLength: 1001 }, { features: [] }, { features: ['未知'] }, { apiKey: 'a\nb' }, { product: '字'.repeat(201) }]) {
    assert.throws(() => validateInput({ ...input, ...patch }), { code: 'INVALID_INPUT' });
  }
});
test('提示词含事实限制、不同开头、精确篇数和字数口径，且不含 Key', () => {
  const messages = buildMessages(input);
  assert.match(messages[0].content, /不要虚构/);
  assert.match(messages[0].content, /不同的开头/);
  assert.match(messages[0].content, /120～150/);
  assert.match(messages[0].content, /包含标点/);
  assert.match(messages[1].content, /你帮我写5个135字左右的文案/);
  assert.match(messages[1].content, /每个开头的侧重点不同/);
  assert.ok(!JSON.stringify(messages).includes(input.apiKey));
});
test('解析 JSON 和代码围栏，计算实际字数，不强制截断超长正文', () => {
  assert.equal(parseCopies(content, input).length, 5);
  assert.equal(parseCopies('```json\n' + content + '\n```', input)[0].characterCount, 11);
  const long = JSON.stringify({ copies: [{ focus: '情绪', text: '字'.repeat(200) }] });
  assert.equal(parseCopies(long, { ...input, count: 1 })[0].characterCount, 200);
});
test('空响应、无效 JSON、篇数错误及缺失字段返回明确错误', () => {
  assert.throws(() => parseCopies('', input), { code: 'EMPTY_OUTPUT' });
  for (const value of ['hello', 'null', '{}', '{"copies":[]}', JSON.stringify({ copies: [null] })]) {
    assert.throws(() => parseCopies(value, input), { code: 'INVALID_OUTPUT' });
  }
});
test('错误分类区分 Key、余额、权限、模型、限流和服务异常', () => {
  for (const [status, detail, code] of [[401, '', 'INVALID_KEY'], [402, '', 'BALANCE'], [403, 'insufficient balance', 'BALANCE'], [403, '', 'PERMISSION'], [404, '', 'MODEL_UNAVAILABLE'], [400, 'unknown model', 'MODEL_UNAVAILABLE'], [429, '', 'RATE_LIMIT'], [429, 'quota exceeded', 'BALANCE'], [500, '', 'UPSTREAM'], [400, '', 'API_REQUEST']]) {
    assert.equal(upstreamError(status, detail).code, code);
  }
});
test('一次生成只调用一次官方接口，Key 只用于认证，不出现在结果', async () => {
  let calls = 0;
  const result = await generate(input, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://aihubmix.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${input.apiKey}`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-4-argon');
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_tokens, 32768);
    assert.equal(body.temperature, undefined);
    return Response.json({ choices: [{ message: { content } }] });
  } });
  assert.equal(calls, 1); assert.equal(result.copies.length, 5);
  assert.ok(!JSON.stringify(result).includes(input.apiKey));
});
test('其他模型使用最小参数，失败不重试或暴露上游原始错误', async () => {
  let calls = 0;
  await assert.rejects(generate({ ...input, model: 'custom-model', reasoningEffort: 'high' }, { fetchImpl: async (_url, options) => {
    calls++;
    assert.deepEqual(Object.keys(JSON.parse(options.body)), ['model', 'messages']);
    return new Response(`bad key: ${input.apiKey}`, { status: 401 });
  } }), error => error.code === 'INVALID_KEY' && !error.message.includes(input.apiKey));
  assert.equal(calls, 1);
});
test('三档思考程度准确传给上游，并返回实际请求档位；旧请求默认低档', async () => {
  assert.equal(validateInput(input).reasoningEffort, 'low');
  for (const reasoningEffort of ['low', 'medium', 'high']) {
    const result = await generate({ ...input, reasoningEffort }, { fetchImpl: async (_url, options) => {
      assert.equal(JSON.parse(options.body).reasoning_effort, reasoningEffort);
      return Response.json({ choices: [{ message: { content } }] });
    } });
    assert.equal(result.reasoningEffort, reasoningEffort);
  }
  for (const reasoningEffort of ['max', '', 1, {}, ['high']]) {
    assert.throws(() => validateInput({ ...input, reasoningEffort }), { code: 'INVALID_INPUT' });
  }
});
test('截断结果和非 JSON 上游响应不会作为成功结果', async () => {
  await assert.rejects(generate(input, { fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content } }] }) }), { code: 'TRUNCATED' });
  await assert.rejects(generate(input, { fetchImpl: async () => new Response('not json') }), { code: 'INVALID_OUTPUT' });
});
