import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export interface DeployArtifact {
  path: string;
  content: string;
}

export interface DeployConfig {
  projectName: string;
  framework?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  deployPath?: string;
}

export interface DeployProgressCallback {
  (progress: number, log: string): void;
}

export interface DeployResult {
  success: boolean;
  deployId: string;
  url?: string;
  providerId: string;
  logs: string[];
  error?: string;
  downloadPath?: string;
}

export interface IDeployProvider {
  readonly id: string;
  readonly name: string;
  deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult>;
}

class VercelProvider implements IDeployProvider {
  readonly id = "vercel";
  readonly name = "Vercel";

  async deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const logs: string[] = [];

    try {
      const token = config.vercelToken || process.env.VERCEL_TOKEN;
      if (!token) {
        throw new Error("Vercel 部署需要配置 VERCEL_TOKEN 环境变量");
      }

      onProgress(10, "创建 Vercel 部署...");
      logs.push("创建 Vercel 部署...");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const body: Record<string, unknown> = {
        name: config.projectName || "agenthub-deploy",
        target: "production",
        projectSettings: {
          framework: config.framework || "static",
        },
      };

      if (config.vercelTeamId) {
        body.teamId = config.vercelTeamId;
      }

      const createRes = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Vercel API 错误: ${createRes.status} - ${errText}`);
      }

      const deployment = await createRes.json() as { id: string; url?: string; alias?: string[] };
      onProgress(30, `部署已创建: ${deployment.id}`);
      logs.push(`部署 ID: ${deployment.id}`);

      const totalFiles = artifacts.length;
      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        const progress = 30 + Math.round((i / totalFiles) * 40);
        onProgress(progress, `上传文件: ${artifact.path}`);
        logs.push(`上传: ${artifact.path}`);

        const fileRes = await fetch(
          `https://api.vercel.com/v13/deployments/${deployment.id}/files`,
          {
            method: "POST",
            headers: { ...headers },
            body: JSON.stringify({ file: artifact.path, data: artifact.content }),
          }
        );

        if (!fileRes.ok) {
          logs.push(`文件上传警告: ${artifact.path} - ${fileRes.status}`);
        }
      }

      onProgress(80, "等待部署完成...");
      logs.push("等待部署完成...");

      let retries = 30;
      while (retries > 0) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(
          `https://api.vercel.com/v13/deployments/${deployment.id}`,
          { headers }
        );

        if (statusRes.ok) {
          const status = await statusRes.json() as {
            state: string;
            alias?: string[];
            url?: string;
          };
          if (status.state === "READY") {
            const url = `https://${status.alias?.[0] ?? status.url ?? deployment.url ?? "unknown.vercel.app"}`;
            onProgress(100, `部署成功: ${url}`);
            logs.push(`部署成功: ${url}`);
            return {
              success: true,
              deployId,
              url,
              providerId: this.id,
              logs,
            };
          }
          if (status.state === "ERROR") {
            throw new Error("Vercel 部署状态错误");
          }
        }
        retries--;
      }

      throw new Error("Vercel 部署超时");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "未知错误";
      logs.push(`错误: ${errorMsg}`);
      logger.warn(`Vercel deploy failed: ${errorMsg}`, "Deploy");
      return {
        success: false,
        deployId,
        providerId: this.id,
        logs,
        error: errorMsg,
      };
    }
  }
}

class StaticDownloadProvider implements IDeployProvider {
  readonly id = "static-download";
  readonly name = "静态包下载";

  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || join(process.cwd(), "deploy-output");
  }

  async deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    _config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const logs: string[] = [];

    try {
      onProgress(10, "准备静态文件...");
      logs.push("准备静态文件...");

      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }

      const deployDir = join(this.outputDir, deployId);
      if (!existsSync(deployDir)) {
        mkdirSync(deployDir, { recursive: true });
      }

      const totalFiles = artifacts.length;
      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        const progress = 10 + Math.round((i / totalFiles) * 50);
        onProgress(progress, `写入: ${artifact.path}`);
        logs.push(`写入: ${artifact.path}`);

        const filePath = join(deployDir, artifact.path);
        const dirPath = join(deployDir, artifact.path.split("/").slice(0, -1).join("/"));
        if (!existsSync(dirPath)) {
          mkdirSync(dirPath, { recursive: true });
        }

        const ws = createWriteStream(filePath, "utf-8");
        ws.write(artifact.content);
        ws.end();
        await new Promise<void>((resolve, reject) => {
          ws.on("finish", resolve);
          ws.on("error", reject);
        });
      }

      onProgress(70, "打包压缩文件...");
      logs.push("打包压缩文件...");

      const downloadUrl = `/api/download/${deployId}`;
      const downloadPath = join(deployDir, "bundle.tar.gz");

      try {
        const { execSync } = await import("child_process");
        const tarCmd = process.platform === "win32"
          ? `powershell -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${deployDir}\\bundle.zip' -Force"`
          : `tar -czf "${downloadPath}" -C "${deployDir}" .`;

        execSync(tarCmd, { stdio: "pipe" });

        const zipPath = process.platform === "win32"
          ? join(deployDir, "bundle.zip")
          : downloadPath;

        if (!existsSync(zipPath)) {
          throw new Error("压缩文件生成失败");
        }

        logs.push(`压缩完成: ${basename(zipPath)}`);
      } catch {
        logs.push("跳过压缩，直接提供文件列表下载");
      }

      onProgress(100, "静态包已生成");
      logs.push("静态包已生成");

      return {
        success: true,
        deployId,
        url: downloadUrl,
        providerId: this.id,
        logs,
        downloadPath: deployDir,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "未知错误";
      logs.push(`错误: ${errorMsg}`);
      return {
        success: false,
        deployId,
        providerId: this.id,
        logs,
        error: errorMsg,
      };
    }
  }
}

class SelfHostedProvider implements IDeployProvider {
  readonly id = "self-hosted";
  readonly name = "自托管服务器";

  async deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const logs: string[] = [];

    try {
      const { sshHost, sshPort, sshUser, sshKey, deployPath } = config;
      if (!sshHost || !sshUser) {
        throw new Error("自托管部署需要配置 SSH 主机和用户名");
      }

      const host = sshHost;
      const port = sshPort || 22;
      const user = sshUser;
      const remotePath = deployPath || "/var/www/app";

      onProgress(10, `连接 ${user}@${host}:${port}...`);
      logs.push(`连接 ${user}@${host}:${port}...`);

      const deployDir = join(process.cwd(), "deploy-output", deployId);
      if (!existsSync(deployDir)) {
        mkdirSync(deployDir, { recursive: true });
      }

      const totalFiles = artifacts.length;
      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        const progress = 15 + Math.round((i / totalFiles) * 25);
        onProgress(progress, `准备: ${artifact.path}`);
        logs.push(`准备: ${artifact.path}`);

        const filePath = join(deployDir, artifact.path);
        const dirPath = join(deployDir, artifact.path.split("/").slice(0, -1).join("/"));
        if (!existsSync(dirPath)) {
          mkdirSync(dirPath, { recursive: true });
        }

        const ws = createWriteStream(filePath, "utf-8");
        ws.write(artifact.content);
        ws.end();
        await new Promise<void>((resolve, reject) => {
          ws.on("finish", resolve);
          ws.on("error", reject);
        });
      }

      onProgress(45, "同步文件到服务器...");
      logs.push("同步文件到服务器...");

      const tarball = join(deployDir, "deploy.tar.gz");
      const rsyncCmd = `tar -czf "${tarball}" -C "${deployDir}" . 2>/dev/null && scp -o StrictHostKeyChecking=no -P ${port} ${sshKey ? `-i "${sshKey}"` : ""} "${tarball}" "${user}@${host}:/tmp/deploy-agentub-${deployId}.tar.gz"`;

      try {
        await execAsync(rsyncCmd, { timeout: 60000 });

        onProgress(70, "解压并部署到目标目录...");
        logs.push("解压部署...");

        const remoteCmd = `mkdir -p "${remotePath}" && tar -xzf "/tmp/deploy-agentub-${deployId}.tar.gz" -C "${remotePath}" && rm "/tmp/deploy-agentub-${deployId}.tar.gz"`;
        const sshCmd = `ssh -o StrictHostKeyChecking=no -p ${port} ${sshKey ? `-i "${sshKey}"` : ""} "${user}@${host}" '${remoteCmd}'`;

        await execAsync(sshCmd, { timeout: 30000 });

        onProgress(90, "重启服务...");
        logs.push("重启服务...");

        const nginxReload = `ssh -o StrictHostKeyChecking=no -p ${port} ${sshKey ? `-i "${sshKey}"` : ""} "${user}@${host}" 'sudo nginx -s reload 2>/dev/null || echo nginx-not-available'`;
        await execAsync(nginxReload, { timeout: 10000 }).catch(() => {
          logs.push("Nginx 不可用，跳过重载");
        });
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        logs.push(`SSH 命令警告: ${msg}`);
        throw new Error(`SSH 连接失败: ${msg}`);
      }

      const url = `http://${host}`;
      onProgress(100, `部署成功: ${url}`);
      logs.push(`部署成功: ${url}`);

      return {
        success: true,
        deployId,
        url,
        providerId: this.id,
        logs,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "未知错误";
      logs.push(`错误: ${errorMsg}`);
      logger.warn(`Self-hosted deploy failed: ${errorMsg}`, "Deploy");
      return {
        success: false,
        deployId,
        providerId: this.id,
        logs,
        error: errorMsg,
      };
    }
  }
}

class DeployManager {
  private providers = new Map<string, IDeployProvider>();

  constructor() {
    this.register(new VercelProvider());
    this.register(new StaticDownloadProvider());
    this.register(new SelfHostedProvider());
  }

  register(provider: IDeployProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): IDeployProvider | undefined {
    return this.providers.get(id);
  }

  listProviders(): Array<{ id: string; name: string }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  async deploy(
    providerId: string,
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        success: false,
        deployId,
        providerId,
        logs: [`未找到部署提供商: ${providerId}`],
        error: `未找到部署提供商: ${providerId}`,
      };
    }

    return provider.deploy(deployId, artifacts, config, onProgress);
  }
}

export const deployManager = new DeployManager();

export function getDeployOutputDir(): string {
  return join(process.cwd(), "deploy-output");
}
