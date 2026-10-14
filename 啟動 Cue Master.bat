@echo off
chcp 65001 > nul
cls
echo ========================================================
echo   🎭 Cue Master - 專業劇場影音播放控制台
echo ========================================================
echo.

if exist "node_modules\.bin\electron.cmd" (
    echo [OK] 正在以最新專案代碼啟動 Cue Master...
    call "node_modules\.bin\electron.cmd" .
) else if exist "dist\win-unpacked\Cue Master.exe" (
    echo [OK] 正在啟動 Cue Master 原生桌面程式...
    start "" "dist\win-unpacked\Cue Master.exe"
) else (
    echo [OK] 正在啟動後台服務器並開啟控制台...
    start "" http://localhost:8080
    node server.js
)
