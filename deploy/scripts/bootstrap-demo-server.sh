#!/usr/bin/env bash

# =============================================================================
# Ubuntu 演示环境初始化脚本
# 用途：
# 1. 安装 Node.js / pnpm / PM2 / Nginx / Redis
# 2. 安装 PostgreSQL 16 + pgvector
# 3. 安装 MinIO
# 4. 创建基础目录
# 5. 适合单机演示环境
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ "${EUID}" -ne 0 ]]; then
  echo -e "${RED}请使用 root 或 sudo 运行该脚本${NC}"
  exit 1
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Fullstack Demo Server Bootstrap (Ubuntu)${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}[1/8] 更新系统包索引...${NC}"
apt update
apt install -y curl wget gnupg ca-certificates lsb-release software-properties-common unzip git build-essential

echo -e "${YELLOW}[2/8] 安装 Node.js 20、pnpm、PM2...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

echo -e "${YELLOW}[3/8] 安装 Nginx 与 Redis...${NC}"
apt install -y nginx redis-server
systemctl enable nginx
systemctl enable redis-server
systemctl restart redis-server

echo -e "${YELLOW}[4/8] 安装 PostgreSQL 16 与 pgvector...${NC}"
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
apt update
apt install -y postgresql-16 postgresql-client-16 postgresql-16-pgvector
systemctl enable postgresql
systemctl restart postgresql

echo -e "${YELLOW}[5/8] 创建 PostgreSQL 数据库与 vector 扩展...${NC}"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = 'fullstack';" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER fullstack WITH PASSWORD 'ChangeThisDbPassword!';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'fullstack';" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE fullstack OWNER fullstack;"

sudo -u postgres psql -d fullstack -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo -e "${YELLOW}[6/8] 安装 MinIO...${NC}"
if [[ ! -f /usr/local/bin/minio ]]; then
  wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
fi

id -u minio &>/dev/null || useradd -r minio -s /sbin/nologin
mkdir -p /opt/minio/data
chown -R minio:minio /opt/minio

cat >/etc/default/minio <<'EOF'
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=ReplaceWithStrongMinioSecret!
MINIO_VOLUMES="/opt/minio/data"
MINIO_OPTS="--console-address :9001"
EOF

cat >/etc/systemd/system/minio.service <<'EOF'
[Unit]
Description=MinIO
After=network-online.target
Wants=network-online.target

[Service]
User=minio
Group=minio
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES $MINIO_OPTS
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable minio
systemctl restart minio

echo -e "${YELLOW}[7/8] 创建项目与日志目录...${NC}"
mkdir -p /var/www/fullstack
mkdir -p /var/log/fullstack

echo -e "${YELLOW}[8/8] 输出结果...${NC}"
echo ""
echo -e "${GREEN}基础环境初始化完成${NC}"
echo ""
echo -e "Node.js:  $(node -v)"
echo -e "pnpm:     $(pnpm -v)"
echo -e "PM2:      $(pm2 -v)"
echo -e "Nginx:    $(nginx -v 2>&1)"
echo -e "Redis:    $(redis-server --version | head -n 1)"
echo -e "Postgres: $(psql --version)"
echo ""
echo -e "${YELLOW}后续你需要继续做：${NC}"
echo -e "1. git clone 项目到 /var/www/fullstack"
echo -e "2. 复制 apps/server/.env.production.example -> apps/server/.env"
echo -e "3. 修改数据库、JWT、AI Key、MinIO 密钥"
echo -e "4. 执行 pnpm install / pnpm build / pnpm db:generate / pnpm db:push / seed"
echo -e "5. 用 PM2 启动后端"
echo -e "6. 把 deploy/nginx/fullstack-demo.conf 放到 /etc/nginx/conf.d/"
