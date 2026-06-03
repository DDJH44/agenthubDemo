# 自有服务器自动化部署

AgentHub 的“自有服务器”部署目标由后端执行 SSH 上传，前端只提交产物文件，不接触主机地址、用户名或密钥。

## 环境变量

在本地 `.env.local` 或服务器进程环境中配置：

```bash
SELF_HOSTED_SSH_HOST=your-server.example.com
SELF_HOSTED_SSH_PORT=22
SELF_HOSTED_SSH_USER=deploy
SELF_HOSTED_SSH_KEY=C:\Users\Lenovo\.ssh\id_rsa
SELF_HOSTED_DEPLOY_PATH=/var/www/agenthub-sites
SELF_HOSTED_PUBLIC_URL=https://your-server.example.com
```

可选项：

```bash
SELF_HOSTED_POST_DEPLOY_COMMAND=systemctl reload nginx
```

`SELF_HOSTED_DEPLOY_PATH` 和 `SELF_HOSTED_PUBLIC_URL` 支持 `{deployId}` 占位符。例如：

```bash
SELF_HOSTED_DEPLOY_PATH=/var/www/agenthub-sites/{deployId}
SELF_HOSTED_PUBLIC_URL=https://your-server.example.com/sites/{deployId}
```

## 服务器准备

1. 创建部署用户，并确保后端机器可以免密 SSH 登录。
2. 给部署用户写入目标目录的权限。
3. 用 Nginx 或 Caddy 将目标目录映射为公网访问地址。
4. 如需自动重载服务，给部署用户配置对应命令权限，或使用 `SELF_HOSTED_POST_DEPLOY_COMMAND`。

未配置自定义发布后命令时，系统会尝试执行无交互 Nginx 重载；如果不可用，不会影响静态文件上传结果。
