export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export const FEATURES = ['有网感', '有情绪', '吸引目标受众', '卖点突出'];
export const countCharacters = (value) => Array.from(value.replace(/\s/gu, '')).length;

export function validateInput(input) {
  if (!input || typeof input !== 'object') throw new AppError('INVALID_INPUT', '请填写文案需求。');
  const fields = { apiKey: 500, model: 150, product: 200, sellingPoints: 4000, audience: 1000, extra: 4000 };
  const data = {};
  for (const [field, max] of Object.entries(fields)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new AppError('INVALID_INPUT', '输入内容过长或格式不正确。');
    data[field] = value.trim();
    if (!data[field] && field !== 'extra') throw new AppError('INVALID_INPUT', '请填写 API Key、模型、产品、卖点和目标受众。');
  }
  if (/[\r\n]/.test(data.apiKey)) throw new AppError('INVALID_INPUT', 'API Key 格式不正确。');
  for (const [field, min, max] of [['count', 1, 10], ['targetLength', 50, 1000]]) {
    if (!Number.isInteger(input[field]) || input[field] < min || input[field] > max) {
      throw new AppError('INVALID_INPUT', field === 'count' ? '生成篇数需为 1～10 的整数。' : '目标字数需为 50～1000 的整数。');
    }
    data[field] = input[field];
  }
  if (!Array.isArray(input.features) || !input.features.length || input.features.some(f => !FEATURES.includes(f))) {
    throw new AppError('INVALID_INPUT', '请至少选择一种表达特点。');
  }
  data.features = [...new Set(input.features)];
  data.reasoningEffort = input.reasoningEffort ?? 'low';
  if (!['low', 'medium', 'high'].includes(data.reasoningEffort)) {
    throw new AppError('INVALID_INPUT', '思考程度请选择低、中或高。');
  }
  return data;
}

export function buildMessages(data) {
  const extraText = data.extra ? `\n补充要求：${data.extra}` : '';
  return [
    {
      role: 'system',
      content: `你是一位顶尖的抖音短视频文案创作者。在创作文案时，请先在思考过程中严格执行以下4步工作流：
1. 【文风定调与符号痛点发散】：拒绝当复读机！不要在多篇文案里机械照搬用户输入的卖点原话，也不要虚构未提供的具体价格或折扣数据。
   - 先根据“产品品类”与“目标受众”锁定最契合的抖音文风（如：文创潮玩走“有梗治愈风”、硬核数码/家电走“痛点爽感测评风”、美食夜宵走“感官暴击解馋风”、家居个护走“高阶松弛感/情绪奢宠风”）。
   - 将核心卖点发散为具体的五感画面（视觉/听觉/触觉/味觉）、使用动作、反差对比或拟人化台词；将目标受众拆解为他们真实的生活切面、隐秘痛点与圈层黑话，让受众产生“这说的就是我”的强烈代入感。
2. 【五篇差异化蓝图规划】：动笔前，先为每篇规划截然不同的开头破题角度与表达特点组合（从用户所选特点中每篇挑选1～3项进行强化），例如：
   - 角度一：高频痛点暴击 / 扎心反问或热梗切入（侧重：有网感 + 卖点突出 + 吸引受众）
   - 角度二：沉浸式生活场景 / 情绪共鸣切入（侧重：有情绪 + 吸引受众 + 卖点突出）
   - 角度三：五感视觉冲击 / 极致卖点体验切入（侧重：卖点突出 + 有网感）
   - 角度四：身份代入 / 金句提问切入（侧重：有情绪 + 卖点突出 + 吸引受众）
   - 角度五：社交话题 / 生活方式对比切入（侧重：有网感 + 吸引受众 + 卖点突出）
   确保每篇不仅不同的开头切入点鲜明，整体句式结构和语气风格也完全拉开差异。
3. 【抖音黄金四段式撰稿】：每篇正文按“前3秒强钩子开头（感叹/反问/痛点/画面） → 给产品立一个高能定位标签 → 场景化融合核心卖点（每篇换不同说法） → 情绪拔高或互动收尾”的节奏撰写。
4. 【分句字数精算】：逐句累加并核对正文字数（包含标点，不计空白），若初稿超出或不足目标字数（${data.targetLength}字左右，允许范围 ${data.targetLength - 15}～${data.targetLength + 15} 字），立即在思考中删改精修，确保每篇字数精准达标。

要求简体中文，正文不加 #话题标签。最终只输出 JSON，格式为：
{"copies":[{"focus":"开头切入角度 · 侧重特点组合","text":"完整文案正文"}]}`
    },
    {
      role: 'user',
      content: `这款产品是${data.product}，我要写一个抖音的文案，最大的卖点是${data.sellingPoints}，受众是${data.audience}，你帮我写${data.count}个${data.targetLength}字左右的文案（需要包括其中一到三项：${data.features.join('，')}，每个开头的侧重点不同）。${extraText}`
    }
  ];
}

export function parseCopies(content, data) {
  if (typeof content !== 'string' || !content.trim()) throw new AppError('EMPTY_OUTPUT', '模型没有返回正文。请稍后重试，或更换模型。', 502);
  let parsed;
  try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new AppError('INVALID_OUTPUT', '模型返回的格式无法解析。已有文案已保留，请重新生成。', 502); }
  if (!Array.isArray(parsed?.copies) || parsed.copies.length !== data.count || parsed.copies.some(c => !c || typeof c.focus !== 'string' || !c.focus.trim() || typeof c.text !== 'string' || !c.text.trim())) {
    throw new AppError('INVALID_OUTPUT', '模型返回的篇数或文案内容不完整。已有文案已保留，请重新生成。', 502);
  }
  return parsed.copies.map(c => ({ focus: c.focus.trim(), text: c.text.trim(), characterCount: countCharacters(c.text.trim()) }));
}

export function upstreamError(status, detail = '') {
  if (status === 401) return new AppError('INVALID_KEY', 'API Key 无效或已过期，请检查后重试。', 401);
  if (status === 402 || /insufficient|balance|quota|credit|余额|额度/i.test(detail)) return new AppError('BALANCE', '账户余额或可用额度不足，请检查 AI Hub Mix 账户。', 402);
  if (status === 403) return new AppError('PERMISSION', '当前 Key 没有访问权限，请检查 Key 权限和模型授权。', 403);
  if (status === 404 || /model.*(not found|not exist|unavailable|invalid)|unknown model|模型.*(不存在|不可用)/i.test(detail)) return new AppError('MODEL_UNAVAILABLE', '该模型暂不可用或模型名称不正确，请检查模型名称。', 400);
  if (status === 429) return new AppError('RATE_LIMIT', '请求过于频繁，请稍后再试。', 429);
  if (status >= 500) return new AppError('UPSTREAM', 'AI Hub Mix 或模型服务暂时异常，请稍后再试。', 502);
  return new AppError('API_REQUEST', 'API 未接受本次请求，请检查模型名称和账户设置。', 400);
}

export async function generate(input, { fetchImpl = fetch, signal } = {}) {
  const data = validateInput(input);
  const body = { model: data.model, messages: buildMessages(data) };
  if (data.model === 'gemini-4-argon') Object.assign(body, { reasoning_effort: data.reasoningEffort, max_tokens: 32768 });
  const response = await fetchImpl('https://aihubmix.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.apiKey}` }, body: JSON.stringify(body), signal
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 10000);
    throw upstreamError(response.status, detail);
  }
  let result;
  try { result = await response.json(); } catch { throw new AppError('INVALID_OUTPUT', 'API 返回了无法解析的响应，请稍后重试。', 502); }
  if (result.choices?.[0]?.finish_reason === 'length') throw new AppError('TRUNCATED', '模型输出被截断，请减少篇数或目标字数后重试。', 502);
  const copies = parseCopies(result.choices?.[0]?.message?.content, data);
  return { copies, model: data.model, targetLength: data.targetLength, reasoningEffort: data.model === 'gemini-4-argon' ? data.reasoningEffort : null };
}
