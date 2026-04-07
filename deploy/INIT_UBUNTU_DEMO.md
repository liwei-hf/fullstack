# Ubuntu 演示服务器初始化命令

这份文档适合你现在的项目现状：

- 项目演示
- 单机部署
- 少量用户访问
- 推荐机器：`2C4G 50G SSD`

如果你想最省事，建议这样分工：

- `Node.js / pnpm / PM2 / Nginx`：宿主机安装
- `PostgreSQL / Redis / MinIO`：Docker Compose

这样是当前这套项目最省配置的部署方式。

如果你想省事，直接用仓库里的初始化脚本：

```bash
sudo bash deploy/scripts/bootstrap-demo-server.sh
```

如果你想手动执行，按下面步骤来。

---

## 1. 更新系统

```bash
sudo apt update
sudo apt install -y curl wget gnupg ca-certificates lsb-release software-properties-common unzip git build-essential
```

---

## 2. 安装 Node.js 20、pnpm、PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2
```

检查：

```bash
node -v
pnpm -v
pm2 -v
```

---

## 3. 安装 Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 4. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

---

## 5. 准备项目目录

```bash
sudo mkdir -p /var/www/fullstack
sudo mkdir -p /var/log/fullstack
sudo chown -R $USER:$USER /var/www/fullstack
```

---

## 6. 拉代码与安装依赖

```bash
cd /var/www
git clone <你的仓库地址> fullstack
cd /var/www/fullstack
pnpm install
```

---

## 7. 启动 Docker 基础设施

```bash
bash deploy/scripts/docker-up-demo.sh
```

---

## 8. 配后端生产环境变量

```bash
cp apps/server/.env.production.example apps/server/.env
```

重点改：

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `OPENAI_API_KEY` 或 `ZHIPU_API_KEY`
- `MINIO_SECRET_KEY`
- `CORS_ORIGINS`

---

## 9. 初始化数据库并构建

```bash
pnpm db:generate
pnpm db:push
pnpm --filter=@fullstack/server prisma db seed
pnpm build
```

---

## 10. PM2 启动后端

```bash
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 11. 配 Nginx

```bash
DOMAIN=example.com SERVER_HOST=<你的服务器IP> SERVER_USER=root SSH_KEY_PATH=~/.ssh/fullstack_demo_deploy pnpm deploy:nginx
```

如果你只想先看看渲染后的配置：

```bash
DOMAIN=example.com bash deploy/scripts/render-demo-nginx.sh
```

---

## 12. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx
```

---

## 13. 最后检查

检查这些是否正常：

```bash
pm2 status
sudo systemctl status nginx
docker compose -f deploy/docker-compose.demo.yml ps
```

打开：

- `https://example.com`
- `https://example.com/m/`

确认：

1. 登录正常
2. 上传文档正常
3. ZIP 导入正常
4. 知识库问答正常
5. 智能问数正常

---

## 14. 一句话建议

如果你只是演示：

- 用 `2C4G`
- 单机部署
- Nginx + PM2
- PostgreSQL + Redis + MinIO 走 Docker Compose

这是当前这项目最省事的上线方案。
