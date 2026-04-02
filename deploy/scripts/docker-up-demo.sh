#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "启动 PostgreSQL + Redis + MinIO..."
docker compose -f deploy/docker-compose.demo.yml up -d

echo ""
echo "基础设施启动完成："
echo "  PostgreSQL: postgresql://postgres:postgres@127.0.0.1:5432/fullstack"
echo "  Redis:      redis://127.0.0.1:6379/0"
echo "  MinIO API:  http://127.0.0.1:9000"
echo "  MinIO UI:   http://127.0.0.1:9001"
echo ""
echo "下一步建议："
echo "  1. cp apps/server/.env.production.example apps/server/.env"
echo "  2. pnpm db:generate && pnpm db:push && pnpm --filter=@fullstack/server prisma db seed"
echo "  3. pnpm build"
echo "  4. pm2 start deploy/pm2/ecosystem.config.cjs"
