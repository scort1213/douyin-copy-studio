import { spawn } from 'node:child_process';
import { createApp, PORT } from './server.mjs';

const URL_TARGET = `http://127.0.0.1:${PORT}`;

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch {
    console.log(`请手动在浏览器打开：${url}`);
  }
}

async function isAlreadyRunning() {
  try {
    const response = await fetch(`${URL_TARGET}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.app === 'douyin-copy-studio';
  } catch {
    return false;
  }
}

if (await isAlreadyRunning()) {
  console.log(`检测到「有话 · 抖音文案工作台」已在运行，正在打开浏览器：${URL_TARGET}`);
  openBrowser(URL_TARGET);
  setTimeout(() => process.exit(0), 1200);
} else {
  const app = createApp();
  app.on('error', error => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `端口 ${PORT} 已被占用。如果网站已经启动，请在浏览器打开 ${URL_TARGET}`
        : '本地服务启动失败，请检查端口或系统防火墙设置。'
    );
    process.exit(1);
  });
  app.listen(PORT, '127.0.0.1', () => {
    console.log('========================================================');
    console.log('  有话 · 抖音文案工作台 已启动');
    console.log(`  访问地址：${URL_TARGET}`);
    console.log('  浏览器已自动打开，使用期间请勿关闭此窗口。');
    console.log('  按 Ctrl+C 或直接关闭此窗口即可停止服务。');
    console.log('========================================================');
    openBrowser(URL_TARGET);
  });
}
