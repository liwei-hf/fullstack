# GitHub Actions CI/CD 配置说明

这套仓库默认分成两条工作流：

- `CI`：负责类型检查和构建，确保主分支代码可发布
- `CD`：负责把“只包含构建产物”的发布包推到演示服务器

## 1. 已落地的工作流

- [ci.yml](/Users/liwei/self/fullstack/.github/workflows/ci.yml)
- [cd.yml](/Users/liwei/self/fullstack/.github/workflows/cd.yml)

设计思路：

- `CI` 在 `pull_request` 和 `push main` 时执行
- `CD` 在 `push main` 和手动触发时执行
- 发布阶段复用仓库现有的“产物部署”脚本，而不是上传整仓源码

## 2. 需要在 GitHub 仓库里配置的 Secrets

进入 GitHub 仓库：

- `Settings`
- `Secrets and variables`
- `Actions`

新增以下 Secrets：

- `DEMO_SERVER_HOST`
  内容示例：`47.83.123.25`
- `DEMO_SERVER_USER`
  内容示例：`root`
- `DEMO_SERVER_SSH_KEY`
  内容填写整段私钥，例如 `-----BEGIN OPENSSH PRIVATE KEY----- ...`

说明：

- Host 和 User 严格来说不算敏感，但为了少分变量源，这里统一放到 Secrets 里
- `CD` 明确要求使用 `SSH Key`，不要继续用密码登录

## 3. 服务器端要做的准备

先在本机生成一对专门给 GitHub Actions 使用的 SSH Key：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/fullstack_demo_deploy
```

会生成两份文件：

- 私钥：`~/.ssh/fullstack_demo_deploy`
- 公钥：`~/.ssh/fullstack_demo_deploy.pub`

把公钥追加到服务器：

```bash
ssh root@47.83.123.25
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '这里替换成 fullstack_demo_deploy.pub 的内容' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

然后把私钥文件内容完整复制到 GitHub Secret `DEMO_SERVER_SSH_KEY`。

## 4. 当前发布链路

`CD` 触发后会执行：

1. `pnpm install --frozen-lockfile`
2. 本地构建发布包
3. 上传到服务器
4. 服务器解包
5. 安装 server 运行时依赖
6. 生成 Prisma Client
7. `pm2 restart fullstack-server`
8. 校验 `/`、`/m/`、`/api/auth/refresh`

相关脚本：

- [build-demo-release.sh](/Users/liwei/self/fullstack/deploy/scripts/build-demo-release.sh)
- [deploy-demo-release.sh](/Users/liwei/self/fullstack/deploy/scripts/deploy-demo-release.sh)
- [render-demo-nginx.sh](/Users/liwei/self/fullstack/deploy/scripts/render-demo-nginx.sh)
- [sync-demo-nginx.sh](/Users/liwei/self/fullstack/deploy/scripts/sync-demo-nginx.sh)

本地如果你也想复用同一套免密发布方式，可以直接指定部署私钥：

```bash
SSH_KEY_PATH=~/.ssh/fullstack_demo_deploy SERVER_HOST=47.83.123.25 SERVER_USER=root pnpm deploy:release
```

如果你改了仓库里的 Nginx 模板，同样可以直接同步：

```bash
DOMAIN=liwei.it.com SSH_KEY_PATH=~/.ssh/fullstack_demo_deploy SERVER_HOST=47.83.123.25 SERVER_USER=root pnpm deploy:nginx
```

## 5. 适合你当前项目的原因

这套方式适合当前项目，是因为：

- 服务器上已经有数据库、Redis、MinIO 和 Nginx
- 前后端都能在 CI 环境中本地构建
- 后端运行依赖和静态产物边界清晰
- 不需要为了演示环境引入 K8s 或复杂容器编排

## 6. 后续建议

后面如果你要继续增强，可以按这个顺序演进：

1. 把服务器用户从 `root` 改成专用部署用户
2. 给 `production` environment 加 GitHub 审批
3. 增加回滚目录，比如 `/var/www/releases/<timestamp>`
4. 域名生效后，把 `CD` 的健康检查从 IP 切到正式域名
