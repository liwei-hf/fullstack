#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SERVER_HOST="${SERVER_HOST:-}"
SERVER_USER="${SERVER_USER:-root}"
DOMAIN="${DOMAIN:-}"
SERVER_PATH="${SERVER_PATH:-/var/www/fullstack}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
SSH_PASSWORD="${SSH_PASSWORD:-}"
REMOTE_CONF_PATH="${REMOTE_CONF_PATH:-/etc/nginx/conf.d/fullstack-ip.conf}"
TMP_RENDERED_CONF="$(mktemp /tmp/fullstack-demo-nginx.XXXXXX.conf)"

cleanup() {
  rm -f "${TMP_RENDERED_CONF}"
}
trap cleanup EXIT

if [[ -z "${SERVER_HOST}" ]]; then
  echo "错误：未提供 SERVER_HOST" >&2
  exit 1
fi

if [[ -z "${DOMAIN}" ]]; then
  echo "错误：未提供 DOMAIN，例如 DOMAIN=liwei.it.com" >&2
  exit 1
fi

if [[ -n "${SSH_KEY_PATH}" && ! -f "${SSH_KEY_PATH}" ]]; then
  echo "错误：SSH_KEY_PATH 指向的私钥文件不存在：${SSH_KEY_PATH}" >&2
  exit 1
fi

DOMAIN="${DOMAIN}" \
SERVER_PATH="${SERVER_PATH}" \
OUTPUT_PATH="${TMP_RENDERED_CONF}" \
bash "${PROJECT_ROOT}/deploy/scripts/render-demo-nginx.sh"

ssh_args=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
scp_args=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

if [[ -n "${SSH_KEY_PATH}" ]]; then
  ssh_args=(-i "${SSH_KEY_PATH}" "${ssh_args[@]}")
  scp_args=(-i "${SSH_KEY_PATH}" "${scp_args[@]}")
fi

if [[ -n "${SSH_PASSWORD}" ]]; then
  if ! command -v expect >/dev/null 2>&1; then
    echo "错误：密码登录模式需要本机安装 expect" >&2
    exit 1
  fi
  expect <<EOF
set timeout -1
spawn scp ${scp_args[*]} ${TMP_RENDERED_CONF} ${SERVER_USER}@${SERVER_HOST}:/tmp/fullstack-ip.conf
expect {
  "*assword:" { send "${SSH_PASSWORD}\r"; exp_continue }
  eof
}
EOF
  expect <<EOF
set timeout -1
spawn ssh ${ssh_args[*]} ${SERVER_USER}@${SERVER_HOST} "cp /tmp/fullstack-ip.conf ${REMOTE_CONF_PATH} && nginx -t && systemctl reload nginx && rm -f /tmp/fullstack-ip.conf"
expect {
  "*assword:" { send "${SSH_PASSWORD}\r"; exp_continue }
  eof
}
EOF
else
  scp "${scp_args[@]}" "${TMP_RENDERED_CONF}" "${SERVER_USER}@${SERVER_HOST}:/tmp/fullstack-ip.conf"
  ssh "${ssh_args[@]}" "${SERVER_USER}@${SERVER_HOST}" \
    "cp /tmp/fullstack-ip.conf ${REMOTE_CONF_PATH} && nginx -t && systemctl reload nginx && rm -f /tmp/fullstack-ip.conf"
fi

echo "Nginx 配置已同步到 ${SERVER_USER}@${SERVER_HOST}:${REMOTE_CONF_PATH}"
