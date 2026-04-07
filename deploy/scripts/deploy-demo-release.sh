#!/usr/bin/env bash

# =============================================================================
# 演示环境发布包部署脚本
# =============================================================================
# 用途：
# 1. 本地构建一个只包含产物的发布包
# 2. 上传到已经完成首次部署的服务器
# 3. 服务器只保留发布包内容，不再需要整仓源码
#
# 说明：
# - 本脚本适合“首次部署已经完成，后续日常发版”的场景
# - 不会改动数据库、MinIO 数据
# - 会保留服务器现有 apps/server/.env
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
RELEASE_NAME="${RELEASE_NAME:-fullstack-demo-release}"
REMOTE_TAR="${REMOTE_TAR:-/tmp/${RELEASE_NAME}.tar.gz}"
OUTPUT_TAR="${OUTPUT_TAR:-/tmp/${RELEASE_NAME}.tar.gz}"
SSH_PASSWORD="${SSH_PASSWORD:-}"
REMOTE_SCRIPT_PATH="/tmp/fullstack-deploy-release-remote.sh"

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

if [[ -z "${SERVER_HOST}" ]]; then
  echo -e "${RED}错误：未提供 SERVER_HOST${NC}"
  echo -e "${YELLOW}示例：SERVER_HOST=47.83.123.25 SERVER_USER=root pnpm deploy:release${NC}"
  exit 1
fi

echo -e "${YELLOW}[1/4] 构建发布包...${NC}"
(
  cd "${PROJECT_ROOT}"
  RELEASE_NAME="${RELEASE_NAME}" OUTPUT_TAR="${OUTPUT_TAR}" bash deploy/scripts/build-demo-release.sh
)
echo ""

echo -e "${YELLOW}[2/4] 上传发布包到服务器...${NC}"
run_remote_copy "${OUTPUT_TAR}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_TAR}"
echo -e "  ✓ 已上传到 ${GREEN}${SERVER_USER}@${SERVER_HOST}:${REMOTE_TAR}${NC}"
echo ""

echo -e "${YELLOW}[3/4] 在服务器部署发布包...${NC}"
REMOTE_SCRIPT="$(mktemp /tmp/fullstack-deploy-release-remote.XXXXXX.sh)"
trap 'rm -f "${REMOTE_SCRIPT}"' EXIT
cat > "${REMOTE_SCRIPT}" <<'EOF'
set -euo pipefail

RELEASE_DIR="${SERVER_PATH}/${RELEASE_NAME}"

if [[ ! -d "${SERVER_PATH}" ]]; then
  echo "远程目录不存在：${SERVER_PATH}" >&2
  exit 1
fi

if [[ ! -f "${SERVER_PATH}/apps/server/.env" ]]; then
  echo "未找到远程 apps/server/.env，请先完成首次部署" >&2
  exit 1
fi

mkdir -p /tmp/fullstack-release-backup
cp "${SERVER_PATH}/apps/server/.env" /tmp/fullstack-release-backup/server.env

find "${SERVER_PATH}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xzf "${REMOTE_TAR}" -C "${SERVER_PATH}"

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "发布包目录不存在：${RELEASE_DIR}" >&2
  exit 1
fi

# 将 release 目录中的内容提升到项目根目录，便于继续复用现有 PM2/Nginx 路径。
find "${RELEASE_DIR}" -mindepth 1 -maxdepth 1 -exec mv {} "${SERVER_PATH}/" \;
rmdir "${RELEASE_DIR}"

cp /tmp/fullstack-release-backup/server.env "${SERVER_PATH}/apps/server/.env"
find "${SERVER_PATH}" -name '._*' -delete

cd "${SERVER_PATH}"

# 这里只安装 server 及其 workspace 依赖，不再把整仓源码放到服务器。
# 这里不加 --prod，是因为纯产物部署下 Prisma 仍需要 CLI 生成运行时代码。
pnpm install --frozen-lockfile --filter @fullstack/server...
# Prisma Client 运行时代码不会随 dist 一起产出，纯产物部署时需要在服务器重新生成一次。
pnpm --filter @fullstack/server prisma generate

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_APP_NAME}"
else
  pm2 start deploy/pm2/ecosystem.config.cjs
fi
pm2 save
EOF
run_remote_copy "${REMOTE_SCRIPT}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_SCRIPT_PATH}"
run_remote_command "${SERVER_USER}@${SERVER_HOST}" \
  "SERVER_PATH='${SERVER_PATH}' PM2_APP_NAME='${PM2_APP_NAME}' RELEASE_NAME='${RELEASE_NAME}' REMOTE_TAR='${REMOTE_TAR}' bash '${REMOTE_SCRIPT_PATH}' && rm -f '${REMOTE_SCRIPT_PATH}'"
echo -e "  ✓ 服务器已完成发布包部署${NC}"
echo ""

echo -e "${YELLOW}[4/4] 基础验证...${NC}"
curl -I --max-time 15 "http://${SERVER_HOST}/"
echo ""
curl -I --max-time 15 "http://${SERVER_HOST}/m/"
echo ""
curl -sS --max-time 15 -o /tmp/fullstack-release-api.out -w '%{http_code}' \
  "http://${SERVER_HOST}/api/auth/login" \
  -H 'content-type: application/json' \
  --data '{"account":"admin","password":"Admin123456!","clientType":"admin"}'
echo ""
head -c 200 /tmp/fullstack-release-api.out
echo ""
echo -e "${GREEN}发布完成${NC}"
