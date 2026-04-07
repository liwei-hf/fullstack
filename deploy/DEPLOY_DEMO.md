# 演示环境部署方案

这份方案适合你的当前项目现状：

- 管理端：`React + Vite`
- 手机端：`uni-app H5`
- 后端：`NestJS`
- 数据库：`PostgreSQL + pgvector`
- 队列 / 缓存：`Redis`
- 文档存储：`MinIO`

适用场景：

- 项目演示
- 少量用户试用
- 单机部署

推荐硬件：

- 最低可用：`2C4G 50G SSD`
- 更稳推荐：`2C8G 60G SSD`

---

## 1. 推荐部署方式

对你当前项目，最省配置也最省事的方案是：

- `Nginx`：托管管理端和手机端 H5 静态资源
- `PM2`：运行 NestJS 后端
- `Docker Compose`：运行 PostgreSQL、Redis、MinIO

也就是：

- 应用自己跑
- 基础设施交给 Docker

这样比你手动安装 PostgreSQL / Redis / MinIO 更省事，也更容易重建环境。

---

## 2. 需要的服务

一台 Linux 服务器上准备：

1. `Node.js 20+`
2. `pnpm 9+`
3. `Docker + Docker Compose`
4. `Nginx`
5. `PM2`

---

## 3. 建议域名

你当前仓库已经落到“单域名 + 路径分流”的方案，推荐这样部署：

- 管理端：`https://example.com/`
- 手机端 H5：`https://example.com/m/`
- API：`https://example.com/api`

这样更适合演示环境，也能避免多子域名下的 CORS 与证书维护成本。

---

## 4. 目录建议

推荐部署目录：

```bash
/var/www/fullstack
```

部署后的关键路径：

```bash
/var/www/fullstack/apps/admin/dist
/var/www/fullstack/apps/mobile/dist-m
/var/www/fullstack/apps/server
```

---

## 5. 拉代码与安装依赖

```bash
cd /var/www
git clone <你的仓库地址> fullstack
cd /var/www/fullstack
pnpm install
```

---

## 6. 先起 Docker 基础设施

仓库里已经补好了：

- [docker-compose.demo.yml](/Users/liwei/self/fullstack/deploy/docker-compose.demo.yml)
- [01-pgvector.sql](/Users/liwei/self/fullstack/deploy/docker/postgres/init/01-pgvector.sql)
- [docker-up-demo.sh](/Users/liwei/self/fullstack/deploy/scripts/docker-up-demo.sh)

直接运行：

```bash
bash deploy/scripts/docker-up-demo.sh
```

或者手动执行：

```bash
docker compose -f deploy/docker-compose.demo.yml up -d
```

默认连接信息：

- PostgreSQL：`postgresql://postgres:postgres@127.0.0.1:5432/fullstack`
- Redis：`redis://127.0.0.1:6379/0`
- MinIO API：`http://127.0.0.1:9000`
- MinIO Console：`http://127.0.0.1:9001`

---

## 7. 配置后端环境变量

复制生产环境模板：

```bash
cp apps/server/.env.production.example apps/server/.env
```

至少改这些值：

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `OPENAI_API_KEY` 或 `ZHIPU_API_KEY`
- `MINIO_SECRET_KEY`
- `CORS_ORIGINS`

如果你走当前这套单域名演示部署，`CORS_ORIGINS` 可以写：

```bash
CORS_ORIGINS=https://example.com
```

---

## 8. 初始化数据库

```bash
pnpm db:generate
pnpm db:push
pnpm --filter=@fullstack/server prisma db seed
```

说明：

- 你当前项目还没有完整生产迁移体系，演示环境用 `db push` 最省事
- 正式商用再逐步切到 `prisma migrate deploy`

---

## 9. 构建前后端

```bash
pnpm build
```

构建后：

- 管理端产物：`apps/admin/dist`
- 手机端 H5 产物：`apps/mobile/dist-m`
- 后端产物：`apps/server/dist`

---

## 10. 用 PM2 启动后端

先安装 PM2：

```bash
npm install -g pm2
```

使用仓库里的配置：

```bash
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

说明：

- 配置文件默认后端目录是 `/var/www/fullstack/apps/server`
- 如果你的部署目录不同，请改 [ecosystem.config.cjs](/Users/liwei/self/fullstack/deploy/pm2/ecosystem.config.cjs)

查看状态：

```bash
pm2 status
pm2 logs fullstack-server
```

---

## 11. 配置 Nginx

仓库里维护的是一份正式模板：

- [fullstack-demo.conf](/Users/liwei/self/fullstack/deploy/nginx/fullstack-demo.conf)

推荐直接通过脚本渲染并同步到服务器：

```bash
DOMAIN=example.com SERVER_HOST=your.server.ip SERVER_USER=root SSH_KEY_PATH=~/.ssh/fullstack_demo_deploy pnpm deploy:nginx
```

这条命令会：

1. 把模板里的域名、证书路径、部署路径渲染成正式配置
2. 上传到服务器 `/etc/nginx/conf.d/fullstack-ip.conf`
3. 自动执行 `nginx -t`
4. 自动 `reload nginx`

如果你只是想本地预览渲染后的配置，也可以执行：

```bash
DOMAIN=example.com bash deploy/scripts/render-demo-nginx.sh
```

---

## 12. HTTPS

演示环境也建议上 HTTPS。

最常见做法：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx
```

给根域名和 `www` 申请即可：

- `example.com`
- `www.example.com`

---

## 13. 演示环境最小检查清单

上线后至少检查：

1. 管理端能打开登录页
2. 手机端 H5 能通过 `/m/` 打开首页
3. 管理端登录成功
4. 手机端登录成功
5. 知识库上传普通文档成功
6. ZIP 导入成功
7. 知识库问答能返回答案
8. 智能问数能返回解释和 SQL
9. Redis 中有队列任务
10. MinIO 能看到上传文件

---

## 14. 备份建议

即使只是演示环境，也建议至少做：

### 数据库备份

```bash
docker exec fullstack-postgres pg_dump -U postgres -d fullstack > /var/backups/fullstack-$(date +%F).sql
```

### MinIO 文档备份

至少保留原始文档目录备份，避免知识库丢失后无法重建。

---

## 15. 你现在还需要手动准备的东西

仓库已经补了这些：

- 生产环境变量模板
- PM2 配置
- Nginx 配置
- 部署文档
- 后端 CORS 白名单能力

你还需要自己准备：

1. 云服务器
2. 域名
3. HTTPS 证书
4. 真实 AI Key

---

## 16. 最适合你的上线方式

如果只是项目演示，我建议就是这一套：

- 一台 `2C4G` 或 `2C8G` Linux 服务器
- Nginx + PM2
- PostgreSQL + Redis + MinIO 走 Docker Compose
- 管理端和手机端 H5 静态部署

这是你当前项目最省事、最稳、最容易讲清楚的部署方式。
