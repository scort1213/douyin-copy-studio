#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22 或更新版本，然后再次双击本文件。'
  read '?按回车键退出…'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  print '请升级到 Node.js 22 或更新版本。'
  read '?按回车键退出…'
  exit 1
fi
if curl --silent --max-time 2 http://127.0.0.1:3210/api/health | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).app==="douyin-copy-studio"?0:1)}catch{process.exit(1)}})'; then
  open 'http://127.0.0.1:3210'
  exit 0
fi
node server.mjs &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null' EXIT INT TERM
for attempt in {1..30}; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    read '?服务未能启动。按回车键退出…'
    exit 1
  fi
  if curl --silent --fail --max-time 1 http://127.0.0.1:3210/api/health >/dev/null; then
    open 'http://127.0.0.1:3210'
    break
  fi
  sleep 0.2
done
wait "$app_pid"
