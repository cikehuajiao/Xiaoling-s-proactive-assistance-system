@echo off
chcp 65001 >nul
title 小玲 XiaoLing - 启动器
echo ============================================
echo    小玲 XiaoLing - 主动陪伴机器人
echo ============================================
echo.

REM 检查 Python
where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.9+ 并加入 PATH。
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 安装依赖
echo [1/3] 检查并安装依赖...
pip install -r requirements.txt >nul 2>nul
if errorlevel 1 (
    echo [提示] 依赖安装遇到问题，尝试再装一次...
    pip install -r requirements.txt
)
echo.

REM 启动后端
echo [2/3] 启动小玲后端 (localhost:7788)...
start "小玲后端" /min cmd /c "python app.py"

REM 打开浏览器
echo [3/3] 打开小玲界面...
timeout /t 2 /nobreak >nul
start http://localhost:7788

echo.
echo 小玲已启动！关闭此窗口不会影响小玲运行。
pause >nul