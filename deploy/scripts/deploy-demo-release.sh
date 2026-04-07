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
KEEP_RELEASES="${KEEP_RELEASES:-5}"
SYNC_NGINX="${SYNC_NGINX:-false}"
DOMAIN="${DOMAIN:-}"
SSH_PASSWORD="${SSH_PASSWORD:-}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
REMOTE_SCRIPT_PATH="/tmp/fullstack-deploy-release-remote.sh"

SSH_BASE_ARGS=()
SCP_BASE_ARGS=()

if [[ -n "${SSH_KEY_PATH}" ]]; then
  SSH_BASE_ARGS+=(-i "${SSH_KEY_PATH}")
  SCP_BASE_ARGS+=(-i "${SSH_KEY_PATH}")
fi

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
    scp "${SCP_BASE_ARGS[@]}" "$@"
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
    ssh "${SSH_BASE_ARGS[@]}" "$@"
  fi
}

if [[ -z "${SERVER_HOST}" ]]; then
  echo -e "${RED}错误：未提供 SERVER_HOST${NC}"
  echo -e "${YELLOW}示例：SERVER_HOST=47.83.123.25 SERVER_USER=root pnpm deploy:release${NC}"
  exit 1
fi

if [[ -n "${SSH_KEY_PATH}" && ! -f "${SSH_KEY_PATH}" ]]; then
  echo -e "${RED}错误：SSH_KEY_PATH 指向的私钥文件不存在：${SSH_KEY_PATH}${NC}"
  exit 1
fi

if [[ "${SYNC_NGINX}" == "true" || "${SYNC_NGINX}" == "1" ]] && [[ -z "${DOMAIN}" ]]; then
  echo -e "${RED}错误：SYNC_NGINX 启用时必须提供 DOMAIN${NC}"
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

CURRENT_LINK="${SERVER_PATH}/current"
RELEASES_DIR="${SERVER_PATH}/releases"
SHARED_DIR="${SERVER_PATH}/shared"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
TARGET_RELEASE="${RELEASES_DIR}/${RELEASE_ID}-${RELEASE_NAME}"
TMP_EXTRACT_DIR="$(mktemp -d /tmp/fullstack-release-extract.XXXXXX)"

cleanup() {
  rm -rf "${TMP_EXTRACT_DIR}"
}
trap cleanup EXIT

if [[ ! -d "${SERVER_PATH}" ]]; then
  echo "远程目录不存在：${SERVER_PATH}" >&2
  exit 1
fi

mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}"

if [[ -f "${CURRENT_LINK}/apps/server/.env" ]]; then
  cp "${CURRENT_LINK}/apps/server/.env" "${SHARED_DIR}/server.env"
elif [[ -f "${SERVER_PATH}/apps/server/.env" ]]; then
  # 兼容旧版“直接铺在根目录”的部署结构，第一次切到 releases/current 时复用原有 .env
  cp "${SERVER_PATH}/apps/server/.env" "${SHARED_DIR}/server.env"
fi

if [[ ! -f "${SHARED_DIR}/server.env" ]]; then
  echo "未找到远程 apps/server/.env，请先完成首次部署" >&2
  exit 1
fi

tar -xzf "${REMOTE_TAR}" -C "${TMP_EXTRACT_DIR}"

if [[ ! -d "${TMP_EXTRACT_DIR}/${RELEASE_NAME}" ]]; then
  echo "发布包目录不存在：${TMP_EXTRACT_DIR}/${RELEASE_NAME}" >&2
  exit 1
fi

mv "${TMP_EXTRACT_DIR}/${RELEASE_NAME}" "${TARGET_RELEASE}"
cp "${SHARED_DIR}/server.env" "${TARGET_RELEASE}/apps/server/.env"
find "${TARGET_RELEASE}" -name '._*' -delete

cd "${TARGET_RELEASE}"

pnpm install --frozen-lockfile --filter @fullstack/server...
pnpm --filter @fullstack/server prisma generate

ln -sfn "${TARGET_RELEASE}" "${CURRENT_LINK}"

SERVER_PATH="${SERVER_PATH}" pm2 startOrReload "${CURRENT_LINK}/deploy/pm2/ecosystem.config.cjs" --only "${PM2_APP_NAME}" --update-env
pm2 save

# 仅保留最近几次发布，避免单机演示环境长期堆积旧产物。
find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"${KEEP_RELEASES}" 2>/dev/null | xargs -r rm -rf
EOF
run_remote_copy "${REMOTE_SCRIPT}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_SCRIPT_PATH}"
run_remote_command "${SERVER_USER}@${SERVER_HOST}" \
  "SERVER_PATH='${SERVER_PATH}' PM2_APP_NAME='${PM2_APP_NAME}' RELEASE_NAME='${RELEASE_NAME}' REMOTE_TAR='${REMOTE_TAR}' KEEP_RELEASES='${KEEP_RELEASES}' bash '${REMOTE_SCRIPT_PATH}' && rm -f '${REMOTE_SCRIPT_PATH}'"
echo -e "  ✓ 服务器已完成发布包部署${NC}"
echo ""

if [[ "${SYNC_NGINX}" == "true" || "${SYNC_NGINX}" == "1" ]]; then
  echo -e "${YELLOW}[可选] 同步 Nginx 配置...${NC}"
  DOMAIN="${DOMAIN}" \
  SERVER_HOST="${SERVER_HOST}" \
  SERVER_USER="${SERVER_USER}" \
  SERVER_PATH="${SERVER_PATH}" \
  SSH_PASSWORD="${SSH_PASSWORD}" \
  SSH_KEY_PATH="${SSH_KEY_PATH}" \
  bash "${PROJECT_ROOT}/deploy/scripts/sync-demo-nginx.sh"
  echo ""
fi

echo -e "${YELLOW}[4/4] 基础验证...${NC}"
curl -I --max-time 15 "http://${SERVER_HOST}/"
echo ""
curl -I --max-time 15 "http://${SERVER_HOST}/m/"
echo ""
curl -sS --max-time 15 -o /tmp/fullstack-release-api.out -w '%{http_code}' \
  "http://${SERVER_HOST}/api/health"
echo ""
head -c 200 /tmp/fullstack-release-api.out
echo ""
echo -e "${GREEN}发布完成${NC}"
