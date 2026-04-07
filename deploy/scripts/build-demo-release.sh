#!/usr/bin/env bash

# =============================================================================
# 演示环境发布包构建脚本
# =============================================================================
# 用途：
# 1. 在本地完成构建
# 2. 只收集线上运行真正需要的内容，避免把整仓源码传到服务器
# 3. 产出一个可上传的 tar.gz 发布包
#
# 发布包内容：
# - apps/server/dist            后端构建产物
# - apps/server/prisma          Prisma schema（运行时需要）
# - packages/shared/dist        共享包构建产物
# - apps/admin/dist             管理端静态资源
# - apps/mobile/dist-m          手机端 /m/ 静态资源
# - package.json / pnpm-lock / pnpm-workspace
# - deploy/pm2/ecosystem.config.cjs
# =============================================================================

set -euo pipefail
export COPYFILE_DISABLE=1
export COPY_EXTENDED_ATTRIBUTES_DISABLE=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_NAME="${RELEASE_NAME:-fullstack-demo-release}"
OUTPUT_TAR="${OUTPUT_TAR:-/tmp/${RELEASE_NAME}.tar.gz}"
RELEASE_TMP_DIR="$(mktemp -d /tmp/${RELEASE_NAME}.XXXXXX)"
RELEASE_ROOT="${RELEASE_TMP_DIR}/${RELEASE_NAME}"

cleanup() {
  rm -rf "${RELEASE_TMP_DIR}"
}
trap cleanup EXIT

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack Demo Release Builder${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

cd "${PROJECT_ROOT}"

echo -e "${YELLOW}[1/4] 构建项目产物...${NC}"
pnpm build

# 移动端线上走同域名 /m/ 路径，这里额外构建一份带 base 的产物。
pnpm --filter=@fullstack/mobile exec vite build --base=/m/ --outDir dist-m
echo ""

echo -e "${YELLOW}[2/4] 收集发布文件...${NC}"
mkdir -p \
  "${RELEASE_ROOT}/apps/server" \
  "${RELEASE_ROOT}/apps/admin" \
  "${RELEASE_ROOT}/apps/mobile" \
  "${RELEASE_ROOT}/packages/shared" \
  "${RELEASE_ROOT}/deploy/pm2"

cp package.json "${RELEASE_ROOT}/package.json"
cp pnpm-lock.yaml "${RELEASE_ROOT}/pnpm-lock.yaml"
cp pnpm-workspace.yaml "${RELEASE_ROOT}/pnpm-workspace.yaml"

cp apps/server/package.json "${RELEASE_ROOT}/apps/server/package.json"
cp -R apps/server/dist "${RELEASE_ROOT}/apps/server/dist"
cp -R apps/server/prisma "${RELEASE_ROOT}/apps/server/prisma"

cp packages/shared/package.json "${RELEASE_ROOT}/packages/shared/package.json"
cp -R packages/shared/dist "${RELEASE_ROOT}/packages/shared/dist"

cp -R apps/admin/dist "${RELEASE_ROOT}/apps/admin/dist"
cp -R apps/mobile/dist-m "${RELEASE_ROOT}/apps/mobile/dist-m"

cp deploy/pm2/ecosystem.config.cjs "${RELEASE_ROOT}/deploy/pm2/ecosystem.config.cjs"
find "${RELEASE_ROOT}" -name '._*' -delete

# macOS 下源码目录可能带有 com.apple.provenance 等扩展属性，
# 这里在打包前统一清理，避免服务器解压时出现大段 xattr 警告。
if [[ "$(uname -s)" == "Darwin" ]] && command -v xattr >/dev/null 2>&1; then
  xattr -rc "${RELEASE_ROOT}" || true
fi
echo -e "  ✓ 已完成发布目录收集${NC}"
echo ""

echo -e "${YELLOW}[3/4] 生成发布包...${NC}"
rm -f "${OUTPUT_TAR}"
if [[ "$(uname -s)" == "Darwin" ]]; then
  tar --no-mac-metadata -czf "${OUTPUT_TAR}" -C "${RELEASE_TMP_DIR}" "${RELEASE_NAME}"
else
  tar -czf "${OUTPUT_TAR}" -C "${RELEASE_TMP_DIR}" "${RELEASE_NAME}"
fi
echo -e "  ✓ 发布包路径：${GREEN}${OUTPUT_TAR}${NC}"
echo ""

echo -e "${YELLOW}[4/4] 输出发布内容...${NC}"
find "${RELEASE_ROOT}" -maxdepth 4 | sort
echo ""
echo -e "${GREEN}发布包构建完成${NC}"
