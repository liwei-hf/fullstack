#!/bin/bash

# =============================================================================
# 开发启动脚本 - Fullstack AI Platform
# =============================================================================
# 用途：
# 1. 日常开发时快速拉起前后端服务
# 2. 不执行 db push / seed，避免反复改动本地数据
# 3. 适合已经完成一次初始化后的本地联调
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
REDIS_PORT=6379
POSTGRES_PORT=5432

check_port() {
    local port=$1
    lsof -tiTCP:${port} -sTCP:LISTEN &> /dev/null
}

free_port() {
    local port=$1
    local pid
    # 只处理真正监听端口的进程，避免把访问开发服务的浏览器连接也误杀掉。
    pid=$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "  ${YELLOW}检测到端口 ${port} 被进程 ${pid} 占用，正在释放...${NC}"
        kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        sleep 1
        if check_port "${port}"; then
            echo -e "  ${RED}无法释放端口 ${port}，请手动检查${NC}"
            exit 1
        fi
    fi
    echo -e "  ✓ 端口 ${port}: ${GREEN}可用${NC}"
}

check_service_port() {
    local port=$1
    lsof -tiTCP:${port} -sTCP:LISTEN &> /dev/null
}

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack AI Platform - 开发脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}[1/3] 检查开发端口占用...${NC}"
free_port "${API_PORT}"
free_port "${ADMIN_PORT}"
free_port "${MOBILE_PORT}"
echo ""

echo -e "${YELLOW}[2/3] 检查开发依赖...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误：未找到 Node.js，请先安装 Node.js（推荐 v18+）${NC}"
    exit 1
fi
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}错误：未找到 pnpm，请先执行 npm install -g pnpm${NC}"
    exit 1
fi
echo -e "  ✓ Node.js: ${GREEN}$(node -v)${NC}"
echo -e "  ✓ pnpm: ${GREEN}$(pnpm -v)${NC}"
echo ""

echo -e "${YELLOW}[3/4] 检查基础依赖服务...${NC}"
if check_service_port "${POSTGRES_PORT}"; then
    echo -e "  ✓ PostgreSQL: ${GREEN}已启动${NC}（localhost:${POSTGRES_PORT}）"
else
    echo -e "  ${RED}错误：PostgreSQL 未启动${NC}（期望 localhost:${POSTGRES_PORT}）"
    echo -e "  ${YELLOW}可执行：docker compose -f deploy/docker-compose.demo.yml up -d${NC}"
    exit 1
fi

if check_service_port "${REDIS_PORT}"; then
    echo -e "  ✓ Redis: ${GREEN}已启动${NC}（localhost:${REDIS_PORT}）"
else
    echo -e "  ${RED}错误：Redis 未启动${NC}（期望 localhost:${REDIS_PORT}）"
    echo -e "  ${YELLOW}可执行：docker compose -f deploy/docker-compose.demo.yml up -d${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}[4/4] 启动开发服务（Turbo）...${NC}"
echo -e "  ${BLUE}后端 API:${NC}  http://localhost:${API_PORT}/api"
echo -e "  ${BLUE}管理端:${NC}    http://localhost:${ADMIN_PORT}"
echo -e "  ${BLUE}手机端 H5:${NC} http://localhost:${MOBILE_PORT}"
echo -e "  ${BLUE}Redis:${NC}     redis://localhost:${REDIS_PORT}"
echo ""
pnpm run dev
