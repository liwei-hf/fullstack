@echo off
REM =============================================================================
REM 开发启动脚本 - Fullstack Interview Project (Windows 版本)
REM =============================================================================
REM 用途：
REM 1. 日常开发时快速拉起前后端服务
REM 2. 不执行 db push / seed，避免反复改动本地数据
REM 3. 适合已经完成一次初始化后的本地联调
REM =============================================================================

setlocal enabledelayedexpansion
chcp 65001 >nul

echo ============================================
echo    Fullstack Interview Project - 开发脚本
echo ============================================
echo.

echo [1/2] 检查环境依赖...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 Node.js，请先安装 Node.js（推荐 v18+）
    exit /b 1
)
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 pnpm，请运行：npm install -g pnpm
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VERSION=%%i
echo   [OK] Node.js: %NODE_VERSION%
echo   [OK] pnpm: %PNPM_VERSION%
echo.

echo [2/2] 启动开发服务（Turbo）...
echo   后端 API:  http://localhost:3334/api
echo   管理端:    http://localhost:3335
echo   手机端 H5: http://localhost:3336
echo.
call pnpm run dev

endlocal
