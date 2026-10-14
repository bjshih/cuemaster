@echo off
chcp 65001 > nul
echo ========================================================
echo   🎭 正在執行 Cue Master 獨立自動化測試與模擬程式...
echo   基準專案: 《星星月月》
echo ========================================================
echo.
python tests\test_runner.py
echo.
pause
