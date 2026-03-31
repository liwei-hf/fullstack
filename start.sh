#!/bin/bash

# =============================================================================
# 一键启动脚本 - Fullstack Interview Project
# =============================================================================
# 功能：
# 1. 检查环境依赖 (Node.js, pnpm)
# 2. 安装依赖
# 3. 初始化数据库 (Prisma)
# 4. 启动开发服务器 (后端 + 前端)
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -----------------------------------------------------------------------------
# 辅助函数
# -----------------------------------------------------------------------------

# 检查端口是否被占用
check_port() {
    local port=$1
    lsof -i :${port} &> /dev/null
}

# 释放占用的端口
free_port() {
    local port=$1
    local pid=$(lsof -ti :${port})
    if [ -n "$pid" ]; then
        echo -e "  ${YELLOW}警告：端口 ${port} 被进程 ${pid} 占用，正在释放...${NC}"
        kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
        sleep 1
        if check_port ${port}; then
            echo -e "  ${RED}无法释放端口 ${port}，请手动检查${NC}"
            exit 1
        else
            echo -e "  ${GREEN}端口 ${port} 已释放${NC}"
        fi
    fi
}

# -----------------------------------------------------------------------------
# 主程序
# -----------------------------------------------------------------------------

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack Interview Project - 启动脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 0: 检查并释放端口
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[0/5] 检查端口占用...${NC}"

if check_port 3000; then
    free_port 3000
else
    echo -e "  ✓ 端口 3000: ${GREEN}可用${NC}"
fi

if check_port 5173; then
    free_port 5173
else
    echo -e "  ✓ 端口 5173: ${GREEN}可用${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# Step 1: 检查环境依赖
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[1/5] 检查环境依赖...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误：未找到 Node.js，请先安装 Node.js (推荐 v18+)${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "  ✓ Node.js: ${GREEN}${NODE_VERSION}${NC}"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}错误：未找到 pnpm，请运行：npm install -g pnpm${NC}"
    exit 1
fi
PNPM_VERSION=$(pnpm -v)
echo -e "  ✓ pnpm: ${GREEN}${PNPM_VERSION}${NC}"

echo ""

# -----------------------------------------------------------------------------
# Step 2: 安装依赖
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[2/5] 安装项目依赖...${NC}"

cd "$PROJECT_ROOT"

if [ -d "node_modules" ] && [ -f "pnpm-lock.yaml" ]; then
    echo -e "  ${BLUE}检测到已有依赖，跳过安装${NC}"
else
    pnpm install
    echo -e "  ${GREEN}依赖安装完成${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# Step 3: 初始化数据库
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[3/5] 初始化数据库 (Prisma)...${NC}"

# 检查 .env 文件
if [ ! -f "apps/server/.env" ]; then
    echo -e "  ${YELLOW}未找到 .env 文件，从 .env.example 复制...${NC}"
    cp apps/server/.env.example apps/server/.env
fi

# 生成 Prisma 客户端
echo -e "  ${BLUE}生成 Prisma 客户端...${NC}"
pnpm run db:generate

# 推送数据库结构
echo -e "  ${BLUE}推送数据库结构...${NC}"
pnpm run db:push

# 播入种子数据
echo -e "  ${BLUE}播入初始数据...${NC}"
pnpm run db:seed

echo -e "  ${GREEN}数据库初始化完成${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 4: 启动开发服务器
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[4/5] 启动开发服务器...${NC}"
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  服务即将启动...${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  ${BLUE}后端服务 (NestJS):${NC} http://localhost:3000"
echo -e "  ${BLUE}前端管理 (React):${NC} http://localhost:5173 (Vite 默认端口)"
echo ""
echo -e "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 5: 启动服务 (使用 Turbo 同时启动前后端)
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[5/5] 启动服务...${NC}"

# 最后一次检查端口（防止在脚本运行期间被其他进程占用）
if check_port 3000; then
    free_port 3000
fi
if check_port 5173; then
    free_port 5173
fi

echo ""

# 使用 turbo 同时启动所有开发服务器
pnpm run dev
