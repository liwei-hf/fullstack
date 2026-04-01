#!/bin/bash

# =============================================================================
# 初始化启动脚本 - Fullstack Interview Project
# =============================================================================
# 当前脚本对应最新项目结构：
# 1. apps/server   -> NestJS 后端（默认 3334）
# 2. apps/admin    -> React 管理端（默认 3335）
# 3. apps/mobile   -> uni-app H5（默认 3336）
# 4. RAG 基础设施 -> PostgreSQL + pgvector、MinIO、Redis
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_PORT=3334
ADMIN_PORT=3335
MOBILE_PORT=3336
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
REDIS_PORT=6379

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

check_port() {
    local port=$1
    lsof -i :${port} &> /dev/null
}

free_port() {
    local port=$1
    local pid=$(lsof -ti :${port})
    if [ -n "$pid" ]; then
        echo -e "  ${YELLOW}警告：端口 ${port} 被进程 ${pid} 占用，正在释放...${NC}"
        kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        sleep 1
        if check_port "${port}"; then
            echo -e "  ${RED}无法释放端口 ${port}，请手动检查${NC}"
            exit 1
        fi
        echo -e "  ${GREEN}端口 ${port} 已释放${NC}"
    else
        echo -e "  ✓ 端口 ${port}: ${GREEN}可用${NC}"
    fi
}

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack Interview Project - 初始化脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}[0/5] 检查开发端口占用...${NC}"
free_port "${API_PORT}"
free_port "${ADMIN_PORT}"
free_port "${MOBILE_PORT}"
echo ""

echo -e "${YELLOW}[1/5] 检查环境依赖...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}错误：未找到 Node.js，请先安装 Node.js（推荐 v18+）${NC}"
    exit 1
fi
echo -e "  ✓ Node.js: ${GREEN}$(node -v)${NC}"

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}错误：未找到 pnpm，请先执行 npm install -g pnpm${NC}"
    exit 1
fi
echo -e "  ✓ pnpm: ${GREEN}$(pnpm -v)${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "  ${YELLOW}提示：未检测到 docker，若你本地通过容器运行 PostgreSQL/MinIO，请先手动启动${NC}"
else
    echo -e "  ✓ docker: ${GREEN}$(docker --version | cut -d',' -f1)${NC}"
fi

echo ""

echo -e "${YELLOW}[2/5] 安装项目依赖...${NC}"
cd "$PROJECT_ROOT"

if [ -d "node_modules" ] && [ -f "pnpm-lock.yaml" ]; then
    echo -e "  ${BLUE}检测到已有依赖，跳过安装${NC}"
else
    pnpm install
    echo -e "  ${GREEN}依赖安装完成${NC}"
fi
echo ""

echo -e "${YELLOW}[3/5] 初始化项目配置与 Prisma...${NC}"

if [ ! -f "apps/server/.env" ]; then
    echo -e "  ${YELLOW}未找到 apps/server/.env，正在从 .env.example 复制...${NC}"
    cp apps/server/.env.example apps/server/.env
fi

echo -e "  ${BLUE}生成 Prisma Client...${NC}"
pnpm run db:generate

echo -e "  ${BLUE}同步数据库结构（prisma db push）...${NC}"
pnpm run db:push

echo -e "  ${BLUE}播入基础种子数据...${NC}"
pnpm run db:seed

echo -e "  ${GREEN}数据库初始化完成${NC}"
echo ""

echo -e "${YELLOW}[4/5] 启动前提示...${NC}"
echo -e "  ${BLUE}后端 API:${NC}        http://localhost:${API_PORT}/api"
echo -e "  ${BLUE}管理端:${NC}          http://localhost:${ADMIN_PORT}"
echo -e "  ${BLUE}手机端 H5:${NC}       http://localhost:${MOBILE_PORT}"
echo -e "  ${BLUE}MinIO API:${NC}       http://localhost:${MINIO_API_PORT}"
echo -e "  ${BLUE}MinIO Console:${NC}   http://localhost:${MINIO_CONSOLE_PORT}"
echo -e "  ${BLUE}Redis:${NC}           redis://localhost:${REDIS_PORT}"
echo ""
echo -e "  ${YELLOW}说明：${NC}本脚本适合首次初始化，会执行 Prisma 同步和种子数据播入。"
echo -e "  ${YELLOW}日常开发：${NC}建议改用 ./dev.sh，避免反复执行 db push / seed。"
echo -e "  ${YELLOW}默认账号：${NC}admin / Admin123456!"
echo -e "  ${YELLOW}按 Ctrl+C 可以停止当前脚本拉起的开发服务${NC}"
echo ""

echo -e "${YELLOW}[5/5] 启动开发服务（Turbo）...${NC}"
echo ""
pnpm run dev
