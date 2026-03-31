@echo off
REM =============================================================================
REM 一键启动脚本 - Fullstack Interview Project (Windows 版本)
REM =============================================================================
REM 功能：
REM 1. 检查环境依赖 (Node.js, pnpm)
REM 2. 安装依赖
REM 3. 初始化数据库 (Prisma)
REM 4. 启动开发服务器 (后端 + 前端)
REM =============================================================================

setlocal enabledelayedexpansion

REM 设置项目根目录
set PROJECT_ROOT=%~dp0

echo ============================================
echo    Fullstack Interview Project - 启动脚本
echo ============================================
echo.

REM -----------------------------------------------------------------------------
REM Step 1: 检查环境依赖
REM -----------------------------------------------------------------------------
echo [1/5] 检查环境依赖...

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 Node.js，请先安装 Node.js (推荐 v18+)
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo   [OK] Node.js: %NODE_VERSION%

REM 检查 pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 pnpm，请运行：npm install -g pnpm
    exit /b 1
)
for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VERSION=%%i
echo   [OK] pnpm: %PNPM_VERSION%
echo.

REM -----------------------------------------------------------------------------
REM Step 2: 安装依赖
REM -----------------------------------------------------------------------------
echo [2/5] 安装项目依赖...

if exist "node_modules" (
    if exist "pnpm-lock.yaml" (
        echo   检测到已有依赖，跳过安装
    ) else (
        call pnpm install
    )
) else (
    call pnpm install
)
echo   依赖安装完成
echo.

REM -----------------------------------------------------------------------------
REM Step 3: 初始化数据库
REM -----------------------------------------------------------------------------
echo [3/5] 初始化数据库 (Prisma)...

REM 检查 .env 文件
if not exist "apps\server\.env" (
    echo   未找到 .env 文件，从 .env.example 复制...
    copy "apps\server\.env.example" "apps\server\.env"
)

REM 生成 Prisma 客户端
echo   生成 Prisma 客户端...
call pnpm run db:generate

REM 推送数据库结构
echo   推送数据库结构...
call pnpm run db:push

REM 播入种子数据
echo   播入初始数据...
call pnpm run db:seed


echo   数据库初始化完成
echo.

REM -----------------------------------------------------------------------------
REM Step 4: 启动开发服务器
REM -----------------------------------------------------------------------------
echo [4/4] 启动开发服务器...
echo.
echo ============================================
echo   服务即将启动...
echo ============================================
echo.
echo   后端服务 (NestJS): http://localhost:3000
echo   前端管理 (React):  http://localhost:5173
echo.
echo   按 Ctrl+C 停止所有服务
echo.

REM -----------------------------------------------------------------------------
REM Step 5: 启动服务 (使用 Turbo 同时启动前后端)
REM -----------------------------------------------------------------------------
call pnpm run dev

endlocal
