#!/bin/bash
cd "$(dirname "$0")"
echo "========================================================"
echo "  🎭 Cue Master - 專業劇場影音播放控制台 (macOS)"
echo "========================================================"
echo ""

if [ -f "node_modules/.bin/electron" ]; then
    echo "[OK] 正在啟動 Cue Master 原生桌面程式..."
    ./node_modules/.bin/electron .
elif command -v npm &> /dev/null; then
    echo "[OK] 正在以 npm 啟動 Cue Master..."
    npm start
else
    echo "[OK] 正在啟動本地伺服器並開啟瀏覽器..."
    open "http://localhost:8080"
    node server.js
fi
