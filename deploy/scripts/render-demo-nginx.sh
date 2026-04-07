#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_PATH="${TEMPLATE_PATH:-${PROJECT_ROOT}/deploy/nginx/fullstack-demo.conf}"
OUTPUT_PATH="${OUTPUT_PATH:-}"
DOMAIN="${DOMAIN:-}"
SERVER_PATH="${SERVER_PATH:-/var/www/fullstack}"
SSL_CERT_PATH="${SSL_CERT_PATH:-}"
SSL_KEY_PATH="${SSL_KEY_PATH:-}"

if [[ -z "${DOMAIN}" ]]; then
  echo "错误：未提供 DOMAIN，例如 DOMAIN=liwei.it.com" >&2
  exit 1
fi

if [[ -z "${SSL_CERT_PATH}" ]]; then
  SSL_CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
fi

if [[ -z "${SSL_KEY_PATH}" ]]; then
  SSL_KEY_PATH="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
fi

rendered_conf="$(sed \
  -e "s|__DOMAIN__|${DOMAIN}|g" \
  -e "s|__SERVER_PATH__|${SERVER_PATH}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT_PATH}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY_PATH}|g" \
  "${TEMPLATE_PATH}")"

if [[ -n "${OUTPUT_PATH}" ]]; then
  printf '%s\n' "${rendered_conf}" > "${OUTPUT_PATH}"
else
  printf '%s\n' "${rendered_conf}"
fi
