@echo off
chcp 65001 >nul
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请打开微信开发者工具，手动导入此文件所在的整个文件夹：
  echo %~dp0
  pause
  exit /b 1
)
node "%~dp0scripts\open-wechat.js"
if errorlevel 1 pause
endlocal
