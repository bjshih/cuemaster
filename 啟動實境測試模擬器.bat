@echo off
chcp 65001 > nul
cls
echo ========================================================
echo   Cue Master - 實境演練模擬器
echo   (模擬舞監操作、舞台影像輸出、喇叭真實發聲)
echo ========================================================
echo.
echo [1] 正在開啟瀏覽器實境演練視窗...
start "" "http://localhost:8080/simulator"
echo [2] 正在確保後台引擎運作中...
node server.js
