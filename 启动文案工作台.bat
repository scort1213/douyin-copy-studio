@echo off
chcp 65001 >nul
title 有话 · 抖音文案工作台
cd /d "%~dp0"

if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0win-start.mjs"
  if errorlevel 1 (
    echo.
    pause
  )
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo [提示] 未检测到内置 runtime\node.exe 或系统 Node.js（需 Node.js 22 或更新版本）。
  echo 请确认已完整解压整个文件夹（保留 runtime 目录），或安装 Node.js 22+ 后重试。
  echo.
  pause
  exit /b 1
)

node "%~dp0win-start.mjs"
if errorlevel 1 (
  echo.
  pause
)
