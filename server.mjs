import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { AppError, generate } from './lib/generate.mjs';

export const PORT = 3210;
const assets = new Map([['/', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']]]);
const publicDir = new URL('./public/', import.meta.url);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function createApp({ fetchImpl = fetch, timeoutMs = 180000 } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const authority = `127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== authority && req.headers.host !== `localhost:${req.socket.localPort}`) return json(res, 403, { error: { message: '仅允许本机访问。' } });
    const url = new URL(req.url, `http://${authority}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { app: 'douyin-copy-studio', version: 1 });
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname);
      try {
        const content = await readFile(new URL(file, publicDir));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(content);
      } catch { json(res, 500, { error: { message: '页面文件读取失败。' } }); }
      return;
    }
    if (req.method !== 'POST' || url.pathname !== '/api/generate') return json(res, 404, { error: { message: '页面不存在。' } });
    if (req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: { message: '请从本地网站页面发起请求。' } });
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64000) throw new AppError('TOO_LARGE', '输入内容过长，请精简后重试。', 413);
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new AppError('INVALID_INPUT', '请求格式不正确。'); }
      const result = await generate(input, { fetchImpl, signal: controller.signal });
      if (!res.destroyed) json(res, 200, result);
    } catch (error) {
      if (res.destroyed) return;
      if (timedOut) json(res, 504, { error: { code: 'TIMEOUT', message: '生成超时，已有结果已保留。请稍后重试或减少篇数。' } });
      else if (error instanceof AppError) json(res, error.status, { error: { code: error.code, message: error.message } });
      else json(res, 502, { error: { code: 'NETWORK', message: '无法连接 AI Hub Mix，请检查网络后重试。' } });
    } finally { clearTimeout(timer); }
  });
}

const isMain = process.argv[1] && (
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  (process.platform === 'win32' && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase())
);
if (isMain) {
  const app = createApp();
  app.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${PORT} 已被占用。如果网站已经启动，请打开 http://127.0.0.1:${PORT}` : '本地服务启动失败。');
    process.exitCode = 1;
  });
  app.listen(PORT, '127.0.0.1', () => console.log(`抖音文案工作台已启动：http://127.0.0.1:${PORT}\n按 Ctrl+C 停止服务。`));
}
