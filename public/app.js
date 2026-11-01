const $ = id => document.getElementById(id);
const keyStorage = 'youhua.apiKey';
const modelStorage = 'youhua.model';
const reasoningStorage = 'youhua.reasoningEffort';
const reasoningLabels = { low: '低', medium: '中', high: '高' };
let result = null;
let controller = null;
let toastTimer;

function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000); }
function showMessage(text, success = false) { $('message').textContent = text; $('message').className = success ? 'success' : ''; $('message').hidden = !text; }
function save(name, value) {
  try { value ? localStorage.setItem(name, value) : localStorage.removeItem(name); }
  catch { showMessage('浏览器禁止本地保存。当前页面仍可使用，但关闭后需要重新填写配置。'); }
}
function updateKeyState() { const filled = !!$('api-key').value.trim(); $('connection-state').textContent = filled ? '已填写 · 待调用验证' : '待填写'; $('connection-state').classList.toggle('ready', filled); }
try { $('api-key').value = localStorage.getItem(keyStorage) || ''; $('model').value = localStorage.getItem(modelStorage) || 'gemini-4-argon'; } catch { showMessage('浏览器不允许读取本地配置，请填写 API Key。'); }
try { const saved = localStorage.getItem(reasoningStorage); $('reasoning-effort').value = Object.hasOwn(reasoningLabels, saved) ? saved : 'low'; } catch { /* Use the default when storage is unavailable. */ }
function updateReasoningState() {
  const supported = $('model').value.trim() === 'gemini-4-argon';
  $('reasoning-effort').disabled = !!controller || !supported;
  $('reasoning-note').textContent = supported ? '高档可能耗时更长、费用更高，不保证文案更好。选择会自动保存。' : '思考程度目前仅适用于 gemini-4-argon；其他模型使用其默认设置。';
}
updateKeyState();
updateReasoningState();
$('api-key').addEventListener('input', () => { save(keyStorage, $('api-key').value.trim()); updateKeyState(); });
$('model').addEventListener('input', () => { save(modelStorage, $('model').value.trim()); updateReasoningState(); });
$('reasoning-effort').addEventListener('change', () => save(reasoningStorage, $('reasoning-effort').value));
$('toggle-key').addEventListener('click', () => { const hide = $('api-key').type === 'text'; $('api-key').type = hide ? 'password' : 'text'; $('toggle-key').textContent = hide ? '显示' : '隐藏'; $('toggle-key').setAttribute('aria-label', `${hide ? '显示' : '隐藏'} API Key`); });
$('clear-key').addEventListener('click', () => { $('api-key').value = ''; save(keyStorage, ''); updateKeyState(); notify('API Key 已清除'); });

$('fill-example').addEventListener('click', () => {
  $('product').value = '2027年单向历';
  $('selling-points').value = '每日一幅小鸭插画，一句充满自信的文案（鼓励自我）';
  $('audience').value = '小镇青年和Z世代'; $('count').value = 5; $('target-length').value = 135;
  $('extra').value = '';
  document.querySelectorAll('[name=feature]').forEach(input => { input.checked = true; });
  notify('单向历范例已填入，可以开始生成了');
});

function setBusy(busy) {
  $('generate').disabled = busy; $('regenerate').disabled = busy || !result; $('cancel').hidden = !busy; $('loading').hidden = !busy;
  $('results').setAttribute('aria-busy', String(busy));
  // Keep every submitted field stable while its request is running.
  document.querySelectorAll('#brief-form input, #brief-form textarea, #fill-example, #api-key, #model, #clear-key').forEach(el => { el.disabled = busy; });
  updateReasoningState();
  $('empty-state').hidden = busy || !!result;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); notify('已复制到剪贴板'); }
  catch { showMessage('复制失败，请选中文案正文并手动复制。'); }
}
function render() {
  $('results').replaceChildren();
  result.copies.forEach((entry, index) => {
    const card = document.createElement('article'); card.className = 'copy-card';
    const top = document.createElement('div'); top.className = 'card-top';
    const focus = document.createElement('span'); focus.className = 'focus-tag'; focus.textContent = entry.focus;
    const number = document.createElement('span'); number.className = 'card-number'; number.textContent = String(index + 1).padStart(2, '0');
    top.append(focus, number);
    const body = document.createElement('p'); body.className = 'copy-body'; body.textContent = entry.text;
    const bottom = document.createElement('div'); bottom.className = 'card-bottom';
    const length = document.createElement('span'); const outside = Math.abs(entry.characterCount - result.targetLength) > 15;
    length.className = `character-count${outside ? ' outside' : ''}`;
    length.textContent = `${entry.characterCount} 字${outside ? ` · 超出参考范围 ${result.targetLength - 15}–${result.targetLength + 15} 字` : ' · 含标点，不计空白'}`;
    const button = document.createElement('button'); button.className = 'copy-button'; button.type = 'button'; button.textContent = '复制文案 ↗'; button.setAttribute('aria-label', `复制第 ${index + 1} 篇文案`); button.addEventListener('click', () => copy(entry.text));
    bottom.append(length, button); card.append(top, body, bottom); $('results').append(card);
  });
  $('result-count').textContent = `${result.copies.length} 篇`; $('copy-all').disabled = false; $('empty-state').hidden = true;
}

async function generate(event) {
  event?.preventDefault(); if (controller) return;
  if (!$('brief-form').reportValidity()) return;
  if (!$('api-key').value.trim()) { showMessage('请先填写 AI Hub Mix API Key。'); $('api-key').focus(); return; }
  if (!$('model').value.trim()) { showMessage('请填写模型名称。'); $('model').focus(); return; }
  const features = Array.from(document.querySelectorAll('[name=feature]:checked'), el => el.value);
  if (!features.length) { showMessage('请至少选择一种表达特点。'); return; }
  const payload = { apiKey: $('api-key').value.trim(), model: $('model').value.trim(), reasoningEffort: $('reasoning-effort').value, product: $('product').value.trim(), sellingPoints: $('selling-points').value.trim(), audience: $('audience').value.trim(), count: Number($('count').value), targetLength: Number($('target-length').value), features, extra: $('extra').value.trim() };
  controller = new AbortController(); showMessage(''); setBusy(true);
  try {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    let data; try { data = await response.json(); } catch { throw new Error('本地服务返回异常，请检查启动窗口。'); }
    if (!response.ok) throw new Error(data.error?.message || '生成失败，请稍后重试。');
    result = data; render();
    const effort = result.reasoningEffort ? ` · 思考程度：${reasoningLabels[result.reasoningEffort]}` : '';
    showMessage(`已生成 ${result.copies.length} 篇文案 · ${result.model}${effort}`, true);
    if (window.matchMedia('(max-width: 760px)').matches) $('results-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showMessage(error.name === 'AbortError' ? '已取消生成，已有文案已保留。上游已开始的请求仍可能计费。' : error instanceof TypeError ? '无法连接本地服务，请确认启动窗口仍在运行。' : error.message);
  } finally { controller = null; setBusy(false); }
}
$('brief-form').addEventListener('submit', generate);
$('regenerate').addEventListener('click', () => generate());
$('cancel').addEventListener('click', () => controller?.abort());
$('copy-all').addEventListener('click', () => { if (result) copy(result.copies.map((entry, index) => `${index + 1}. ${entry.focus}\n${entry.text}`).join('\n\n')); });
