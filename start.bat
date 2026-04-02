@echo off
REM =============================================================================
REM 初始化启动脚本 - Fullstack AI Platform (Windows 版本)
REM =============================================================================
REM 当前脚本对应最新项目结构：
REM 1. apps/server   -> NestJS 后端（默认 3334）
REM 2. apps/admin    -> React 管理端（默认 3335）
REM 3. apps/mobile   -> uni-app H5（默认 3336）
REM 4. RAG 基础设施 -> PostgreSQL + pgvector、MinIO
REM =============================================================================

setlocal enabledelayedexpansion

set PROJECT_ROOT=%~dp0

echo ============================================
echo    Fullstack AI Platform - 初始化脚本
echo ============================================
echo.

REM -----------------------------------------------------------------------------
REM Step 1: 检查环境依赖
REM -----------------------------------------------------------------------------
echo [1/5] 检查环境依赖...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 Node.js，请先安装 Node.js（推荐 v18+）
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo   [OK] Node.js: %NODE_VERSION%

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 pnpm，请运行：npm install -g pnpm
    exit /b 1
)
for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VERSION=%%i
echo   [OK] pnpm: %PNPM_VERSION%

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo   [提示] 未检测到 docker，如通过容器运行 PostgreSQL/MinIO，请先手动启动
) else (
    for /f "tokens=*" %%i in ('docker --version') do set DOCKER_VERSION=%%i
    echo   [OK] docker: %DOCKER_VERSION%
)
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
echo [3/5] 初始化项目配置与 Prisma...

if not exist "apps\server\.env" (
    echo   未找到 apps\server\.env，从 .env.example 复制...
    copy "apps\server\.env.example" "apps\server\.env"
)

echo   生成 Prisma Client...
call pnpm run db:generate

echo   同步数据库结构（prisma db push）...
call pnpm run db:push

echo   播入基础种子数据...
call pnpm run db:seed

echo   数据库初始化完成
echo.

REM -----------------------------------------------------------------------------
REM Step 4: 启动前提示
REM -----------------------------------------------------------------------------
echo [4/5] 启动前提示...
echo.
echo   后端 API:      http://localhost:3334/api
echo   管理端:        http://localhost:3335
echo   手机端 H5:     http://localhost:3336
echo   MinIO API:     http://localhost:9000
echo   MinIO Console: http://localhost:9001
echo.
echo   说明：本脚本适合首次初始化，会执行 Prisma 同步和种子数据播入
echo   日常开发：建议改用 dev.bat，避免反复执行 db push / seed
echo   默认账号：admin / Admin123456!
echo   按 Ctrl+C 停止当前脚本拉起的开发服务
echo.

REM -----------------------------------------------------------------------------
REM Step 5: 启动服务
REM -----------------------------------------------------------------------------
echo [5/5] 启动开发服务（Turbo）...
call pnpm run dev

endlocal
