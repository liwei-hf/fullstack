#!/usr/bin/env bash

# =============================================================================
# 演示服务器日常同步脚本
# =============================================================================
# 用途：
# 1. 把当前本地最新代码同步到已经完成首次部署的服务器
# 2. 保留服务器现有 .env、数据库、MinIO 文件，不做数据清空
# 3. 在服务器重新安装依赖、构建产物，并重启 PM2 服务
#
# 适用场景：
# - 你已经按 deploy/DEPLOY_DEMO.md 完成过一次完整部署
# - 之后只是本地改了代码，想快速同步到线上
#
# 使用方式：
# SERVER_HOST=47.83.123.25 SERVER_USER=root bash deploy/scripts/sync-demo-server.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SERVER_HOST="${SERVER_HOST:-}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PATH="${SERVER_PATH:-/var/www/fullstack}"
PM2_APP_NAME="${PM2_APP_NAME:-fullstack-server}"
REMOTE_TMP_TAR="${REMOTE_TMP_TAR:-/tmp/fullstack-sync-src.tar.gz}"
LOCAL_TMP_TAR="$(mktemp /tmp/fullstack-sync-src.XXXXXX.tar.gz)"
SSH_PASSWORD="${SSH_PASSWORD:-}"
REMOTE_SCRIPT_PATH="/tmp/fullstack-sync-demo-remote.sh"

quote_args() {
  local quoted=""
  local arg
  for arg in "$@"; do
    printf -v arg '%q' "$arg"
    quoted+=" ${arg}"
  done
  printf '%s' "${quoted}"
}

run_remote_copy() {
  if [[ -n "${SSH_PASSWORD}" ]]; then
    if ! command -v expect >/dev/null 2>&1; then
      echo -e "${RED}错误：密码登录模式需要本机安装 expect${NC}"
      exit 1
    fi
    local args
    args="$(quote_args "$@")"
    expect <<EOF
set timeout -1
spawn scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null${args}
expect {
  "*assword:" { send "${SSH_PASSWORD}\r"; exp_continue }
  eof
}
EOF
  else
    scp "$@"
  fi
}

run_remote_command() {
  if [[ -n "${SSH_PASSWORD}" ]]; then
    if ! command -v expect >/dev/null 2>&1; then
      echo -e "${RED}错误：密码登录模式需要本机安装 expect${NC}"
      exit 1
    fi
    local args
    args="$(quote_args "$@")"
    expect <<EOF
set timeout -1
spawn ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null${args}
expect {
  "*assword:" { send "${SSH_PASSWORD}\r"; exp_continue }
  eof
}
EOF
  else
    ssh "$@"
  fi
}

cleanup() {
  rm -f "${LOCAL_TMP_TAR}"
}
trap cleanup EXIT

if [[ -z "${SERVER_HOST}" ]]; then
  echo -e "${RED}错误：未提供 SERVER_HOST${NC}"
  echo -e "${YELLOW}示例：SERVER_HOST=47.83.123.25 SERVER_USER=root bash deploy/scripts/sync-demo-server.sh${NC}"
  exit 1
fi

cd "${PROJECT_ROOT}"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack Demo Server - 日常同步脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}[1/4] 打包本地最新源码...${NC}"
# COPYFILE_DISABLE 可避免 macOS 额外写入 AppleDouble 元数据文件。
COPYFILE_DISABLE=1 tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./.turbo' \
  --exclude='./apps/*/node_modules' \
  --exclude='./apps/*/dist' \
  --exclude='./apps/*/dist-m' \
  --exclude='./apps/*/.turbo' \
  --exclude='./packages/*/node_modules' \
  --exclude='./packages/*/dist' \
  --exclude='./.backup' \
  --exclude='./tmp' \
  --exclude='./.DS_Store' \
  --exclude='._*' \
  --exclude='*/._*' \
  -czf "${LOCAL_TMP_TAR}" .
echo -e "  ✓ 本地源码包：${GREEN}${LOCAL_TMP_TAR}${NC}"
echo ""

echo -e "${YELLOW}[2/4] 上传源码包到服务器...${NC}"
run_remote_copy "${LOCAL_TMP_TAR}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_TMP_TAR}"
echo -e "  ✓ 已上传到 ${GREEN}${SERVER_USER}@${SERVER_HOST}:${REMOTE_TMP_TAR}${NC}"
echo ""

echo -e "${YELLOW}[3/4] 在服务器覆盖代码并重新构建...${NC}"
REMOTE_SCRIPT="$(mktemp /tmp/fullstack-sync-demo-remote.XXXXXX.sh)"
trap 'rm -f "${LOCAL_TMP_TAR}" "${REMOTE_SCRIPT}"' EXIT
cat > "${REMOTE_SCRIPT}" <<'EOF'
set -euo pipefail

if [[ ! -d "${SERVER_PATH}" ]]; then
  echo "远程目录不存在：${SERVER_PATH}" >&2
  exit 1
fi

cd "${SERVER_PATH}"

if [[ ! -f "apps/server/.env" ]]; then
  echo "未找到远程 apps/server/.env，请先完成首次部署" >&2
  exit 1
fi

cp apps/server/.env /tmp/fullstack.server.env.sync

# 保留 .git，避免破坏远程仓库信息，其余代码目录整体覆盖。
find "${SERVER_PATH}" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
tar -xzf "${REMOTE_TMP_TAR}" -C "${SERVER_PATH}"
cp /tmp/fullstack.server.env.sync "${SERVER_PATH}/apps/server/.env"

# 清理历史上传留下的 Apple 元数据文件。
find "${SERVER_PATH}" -name '._*' -delete || true

cd "${SERVER_PATH}"
pnpm install
pnpm db:generate
pnpm build

# 移动端线上走同域名 /m/ 路径，额外构建一份带 base 的产物。
cd "${SERVER_PATH}/apps/mobile"
pnpm exec vite build --base=/m/ --outDir dist-m

cd "${SERVER_PATH}"
if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_APP_NAME}"
else
  pm2 start deploy/pm2/ecosystem.config.cjs
fi
pm2 save

nginx -t
systemctl reload nginx
EOF
run_remote_copy "${REMOTE_SCRIPT}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_SCRIPT_PATH}"
run_remote_command "${SERVER_USER}@${SERVER_HOST}" \
  "SERVER_PATH='${SERVER_PATH}' PM2_APP_NAME='${PM2_APP_NAME}' REMOTE_TMP_TAR='${REMOTE_TMP_TAR}' bash '${REMOTE_SCRIPT_PATH}' && rm -f '${REMOTE_SCRIPT_PATH}'"
echo -e "  ✓ 服务器代码与构建已更新${NC}"
echo ""

echo -e "${YELLOW}[4/4] 进行基础验证...${NC}"
curl -I --max-time 15 "http://${SERVER_HOST}/"
echo ""
curl -I --max-time 15 "http://${SERVER_HOST}/m/"
echo ""
echo -e "${GREEN}同步完成${NC}"
echo -e "  管理端：${BLUE}http://${SERVER_HOST}/${NC}"
echo -e "  移动端：${BLUE}http://${SERVER_HOST}/m/${NC}"
