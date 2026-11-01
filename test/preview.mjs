// Browser QA only. This server never calls the network or uses a real API key.
import { createApp } from '../server.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const focuses = ['自我鼓励', '每日惊喜', '小鸭插画', '新年期待', '生活仪式'];
const bodies = [
  '谁说普通的一天，不值得给自己一点掌声？这本2027年单向历，每天都有一幅小鸭插画，还有一句鼓励自己的话。忙着工作、赶路，也别忘了认真喜欢自己。翻开今天，让可爱的小鸭陪你缓一缓。日子不用过给谁看，愿你慢慢找到自己的节奏。',
  '明天的小鸭会是什么样？2027年单向历，把每天的小期待放进了一幅插画里。再读一句充满自信的话，给还在努力的自己打打气。生活不必每天都热闹，有一份属于自己的小惊喜也很好。翻到新的一天，记得把鼓励也留给自己。',
  '这只小鸭，有点会鼓励人。2027年单向历，每日一幅小鸭插画，搭配一句提醒你相信自己的文案。不管今天忙不忙，都可以停下来看看它。用一点可爱，让日常多一份轻松。你不需要变成别人眼里很厉害的样子，也值得对自己温柔一点。',
  '给2027年的自己留一句话，你会写什么？也许是别怕，也许是慢慢来。这本单向历，每天用一幅小鸭插画和一句自信文案，陪你重新出发。没有人规定生活必须按什么速度前进。翻到今天，记住自己的努力，也为下一步留一点期待。',
  '每天留一分钟，只给自己。看看2027年单向历里的小鸭插画，读一句鼓励自己的话，再开始今天的生活。可能没有什么大事发生，但你认真过的每一天，都值得被看见。把目光从别人的进度收回来。小鸭陪你翻页，你陪自己慢慢长大。'
];
const app = createApp({ timeoutMs: 1800, fetchImpl: async (_url, { body, headers, signal }) => {
  const token = headers.Authorization;
  const request = JSON.parse(body);
  const countMatch = request.messages[1].content.match(/写(\d+)个/);
  const count = countMatch ? Number(countMatch[1]) : 5;
  await delay(token.includes('slow') ? 10000 : 450, undefined, { signal });
  if (token.includes('invalid')) return new Response('invalid key', { status: 401 });
  if (token.includes('balance')) return new Response('insufficient balance', { status: 402 });
  if (token.includes('rate')) return new Response('rate limit', { status: 429 });
  if (token.includes('format')) return Response.json({ choices: [{ message: { content: 'bad format' } }] });
  const copies = Array.from({ length: count }, (_, i) => ({ focus: focuses[i % 5], text: `【模拟测试】${bodies[i % 5]}` }));
  return Response.json({ choices: [{ message: { content: JSON.stringify({ copies }) } }] });
} });
app.listen(3211, '127.0.0.1', () => console.log('仅模拟验收：http://127.0.0.1:3211 · demo-key 成功，invalid-key / balance-key / rate-key / format-key / slow-key 验证异常。'));
