# 自有服务器自动化部署

AgentHub 的“自有服务器”部署目标由后端执行 SSH 上传。前端只提交产物文件和部署目标 ID，不接触私钥。

## 普通用户怎么用

普通用户有两种方式：

1. 直接选择“AgentHub 默认服务器”
   管理员在服务端配置一台默认服务器后，所有用户都可以一键部署。系统会自动使用 `{userId}/{deployId}` 隔离目录，避免不同用户产物互相覆盖。

2. 添加自己的服务器
   用户在部署面板里填写服务器地址、端口、用户名、部署目录和访问地址。AgentHub 后端会自动生成 SSH key，页面只展示公钥。用户把公钥加入服务器的 `~/.ssh/authorized_keys` 后，就可以测试连接并部署。

## 管理员默认服务器环境变量

在本地 `.env.local` 或服务器进程环境中配置：

```bash
DEPLOYMENT_TARGET_SECRET=replace-with-a-long-random-secret
SELF_HOSTED_SSH_HOST=your-server.example.com
SELF_HOSTED_SSH_PORT=22
SELF_HOSTED_SSH_USER=deploy
SELF_HOSTED_SSH_KEY=C:\Users\Lenovo\.ssh\id_rsa
SELF_HOSTED_DEPLOY_PATH=/var/www/agenthub-sites/{userId}/{deployId}
SELF_HOSTED_PUBLIC_URL=https://your-server.example.com/{userId}/{deployId}
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

也支持 `{userId}`：

```bash
SELF_HOSTED_DEPLOY_PATH=/var/www/agenthub-sites/{userId}/{deployId}
SELF_HOSTED_PUBLIC_URL=https://your-server.example.com/{userId}/{deployId}
```

## 服务器准备

1. 创建部署用户，并确保后端机器可以免密 SSH 登录。
2. 给部署用户写入目标目录的权限。
3. 用 Nginx 或 Caddy 将目标目录映射为公网访问地址。
4. 如需自动重载服务，给部署用户配置对应命令权限，或使用 `SELF_HOSTED_POST_DEPLOY_COMMAND`。

未配置自定义发布后命令时，系统会尝试执行无交互 Nginx 重载；如果不可用，不会影响静态文件上传结果。

## 凭据安全

用户自有服务器不会要求上传私钥。AgentHub 会生成一对 SSH key：

- 公钥返回给用户，用户加入服务器 `authorized_keys`。
- 私钥使用 `DEPLOYMENT_TARGET_SECRET` 派生出的 AES-256-GCM 密钥加密后保存。
- 部署时前端只传 `deploymentTargetId`，后端解密私钥并临时写入本机文件，命令执行后清理。

生产环境必须配置稳定且足够长的 `DEPLOYMENT_TARGET_SECRET`。如果更换该值，已有用户部署目标的私钥将无法解密。
