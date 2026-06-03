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
  miaodaWebhookUrl?: string;
  miaodaToken?: string;
  miaodaAppUrl?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  deployPath?: string;
  selfHostedPublicUrl?: string;
  selfHostedPostDeployCommand?: string;
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

  private normalizeProjectName(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return normalized || "agenthub-deploy";
  }

  private withTeamId(url: string, teamId?: string): string {
    if (!teamId) return url;
    const next = new URL(url);
    next.searchParams.set("teamId", teamId);
    return next.toString();
  }

  private formatUrl(url?: string): string | undefined {
    if (!url) return undefined;
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

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

      const files = artifacts.map((artifact) => ({
        file: artifact.path.replace(/\\/g, "/").replace(/^\/+/, "") || "index.html",
        data: artifact.content,
      }));

      const body: Record<string, unknown> = {
        name: this.normalizeProjectName(config.projectName || "agenthub-deploy"),
        target: "production",
        files,
      };

      if (config.framework && config.framework !== "static") {
        body.projectSettings = { framework: config.framework };
      }

      const createUrl = this.withTeamId("https://api.vercel.com/v13/deployments", config.vercelTeamId);
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Vercel API 错误: ${createRes.status} - ${errText}`);
      }

      const deployment = await createRes.json() as { id: string; url?: string; alias?: string[]; readyState?: string; state?: string; status?: string };
      onProgress(30, `部署已创建: ${deployment.id}`);
      logs.push(`部署 ID: ${deployment.id}`);
      logs.push(`已提交 ${files.length} 个文件`);

      onProgress(80, "等待部署完成...");
      logs.push("等待部署完成...");

      let retries = Number(process.env.VERCEL_MAX_POLLS ?? 30);
      const pollIntervalMs = Number(process.env.VERCEL_POLL_INTERVAL_MS ?? 2000);
      while (retries > 0) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const statusRes = await fetch(
          this.withTeamId(`https://api.vercel.com/v13/deployments/${deployment.id}`, config.vercelTeamId),
          { headers }
        );

        if (statusRes.ok) {
          const status = await statusRes.json() as {
            readyState?: string;
            state: string;
            status?: string;
            alias?: string[];
            url?: string;
            errorMessage?: string;
          };
          const readyState = status.readyState ?? status.state ?? status.status;
          logs.push(`Vercel 状态: ${readyState ?? "UNKNOWN"}`);
          if (readyState === "READY") {
            const url = this.formatUrl(status.alias?.[0] ?? status.url ?? deployment.url) ?? "https://unknown.vercel.app";
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
          if (readyState === "ERROR" || readyState === "CANCELED") {
            throw new Error(status.errorMessage || `Vercel 部署状态: ${readyState}`);
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

class MockPreviewProvider implements IDeployProvider {
  readonly id = "mock-preview";
  readonly name = "Mock Preview";

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
      onProgress(8, "创建本地预览环境...");
      logs.push("创建本地预览环境...");

      const deployDir = join(this.outputDir, deployId);
      if (!existsSync(deployDir)) {
        mkdirSync(deployDir, { recursive: true });
      }

      onProgress(25, "校验静态产物...");
      logs.push(`发现 ${artifacts.length} 个文件`);

      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        const progress = 35 + Math.round((i / Math.max(artifacts.length, 1)) * 35);
        onProgress(progress, `写入预览文件: ${artifact.path}`);
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

      onProgress(82, "发布本地预览链接...");
      logs.push("发布本地预览链接...");

      const url = `/api/preview/${deployId}`;
      onProgress(100, `预览已就绪: ${url}`);
      logs.push(`预览已就绪: ${url}`);

      return {
        success: true,
        deployId,
        url,
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

class MiaodaProvider implements IDeployProvider {
  readonly id = "miaoda";
  readonly name = "Miaoda";

  async deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const logs: string[] = [];

    try {
      const webhookUrl = config.miaodaWebhookUrl || process.env.MIAODA_DEPLOY_WEBHOOK;
      const token = config.miaodaToken || process.env.MIAODA_DEPLOY_TOKEN;
      if (!webhookUrl) {
        throw new Error("Miaoda 部署需要配置 MIAODA_DEPLOY_WEBHOOK，或在部署配置中传入 miaodaWebhookUrl");
      }

      onProgress(12, "准备 Miaoda 部署包...");
      logs.push(`准备 ${artifacts.length} 个文件`);

      onProgress(35, "提交到 Miaoda Webhook...");
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          deployId,
          projectName: config.projectName,
          framework: config.framework || "static",
          files: artifacts,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Miaoda Webhook 返回 ${response.status}: ${text}`);
      }

      onProgress(72, "等待 Miaoda 返回应用链接...");
      const data = await response.json().catch(() => ({})) as { url?: string; appUrl?: string };
      const url = data.url || data.appUrl || config.miaodaAppUrl || `${webhookUrl.replace(/\/+$/, "")}/${deployId}`;

      onProgress(100, `Miaoda 部署成功: ${url}`);
      logs.push(`Miaoda 部署成功: ${url}`);

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
      logger.warn(`Miaoda deploy failed: ${errorMsg}`, "Deploy");
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

  private parsePort(value: number | string | undefined): number {
    const parsed = Number(value ?? process.env.SELF_HOSTED_SSH_PORT ?? 22);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 22;
  }

  private interpolate(value: string, deployId: string): string {
    return value.replace(/\{deployId\}/g, deployId);
  }

  private safeDeployId(deployId: string): string {
    return deployId.replace(/[^a-zA-Z0-9_.-]/g, "-");
  }

  private shellOption(flag: string, value?: string): string {
    return value ? `${flag} "${value}"` : "";
  }

  private resolveConfig(config: DeployConfig, deployId: string) {
    const sshHost = config.sshHost || process.env.SELF_HOSTED_SSH_HOST;
    const sshUser = config.sshUser || process.env.SELF_HOSTED_SSH_USER;

    if (!sshHost || !sshUser) {
      throw new Error("自有服务器部署需要配置 SELF_HOSTED_SSH_HOST 和 SELF_HOSTED_SSH_USER");
    }

    const safeDeployId = this.safeDeployId(deployId);
    const deployPath = this.interpolate(
      config.deployPath || process.env.SELF_HOSTED_DEPLOY_PATH || "/var/www/app",
      safeDeployId
    );
    const publicUrl = this.interpolate(
      config.selfHostedPublicUrl || process.env.SELF_HOSTED_PUBLIC_URL || `http://${sshHost}`,
      safeDeployId
    );

    return {
      host: sshHost,
      user: sshUser,
      port: this.parsePort(config.sshPort),
      sshKey: config.sshKey || process.env.SELF_HOSTED_SSH_KEY,
      deployPath,
      publicUrl,
      postDeployCommand: config.selfHostedPostDeployCommand || process.env.SELF_HOSTED_POST_DEPLOY_COMMAND,
      remoteTmpFile: `/tmp/deploy-agenthub-${safeDeployId}.tar.gz`,
    };
  }

  async deploy(
    deployId: string,
    artifacts: DeployArtifact[],
    config: DeployConfig,
    onProgress: DeployProgressCallback
  ): Promise<DeployResult> {
    const logs: string[] = [];

    try {
      const target = this.resolveConfig(config, deployId);

      onProgress(10, `连接 ${target.user}@${target.host}:${target.port}...`);
      logs.push(`目标服务器: ${target.user}@${target.host}:${target.port}`);
      logs.push(`部署目录: ${target.deployPath}`);

      const deployDir = join(process.cwd(), "deploy-output", deployId);
      if (!existsSync(deployDir)) {
        mkdirSync(deployDir, { recursive: true });
      }

      const totalFiles = Math.max(artifacts.length, 1);
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

      const tarball = join(process.cwd(), "deploy-output", `${this.safeDeployId(deployId)}.tar.gz`);
      const sshKeyOption = this.shellOption("-i", target.sshKey);
      const tarCmd = `tar -czf "${tarball}" -C "${deployDir}" .`;
      const scpCmd = `scp -o StrictHostKeyChecking=no -P ${target.port} ${sshKeyOption} "${tarball}" "${target.user}@${target.host}:${target.remoteTmpFile}"`;

      try {
        await execAsync(tarCmd, { timeout: 60000 });
        logs.push("产物打包完成");

        await execAsync(scpCmd, { timeout: 60000 });
        logs.push("产物已上传到服务器临时目录");

        onProgress(70, "解压并部署到目标目录...");
        logs.push("解压部署...");

        const reloadCommand = target.postDeployCommand || "(sudo -n nginx -s reload 2>/dev/null || true)";
        const remoteCmd = `mkdir -p "${target.deployPath}" && tar -xzf "${target.remoteTmpFile}" -C "${target.deployPath}" && rm "${target.remoteTmpFile}" && ${reloadCommand}`;
        const sshCmd = `ssh -o StrictHostKeyChecking=no -p ${target.port} ${sshKeyOption} "${target.user}@${target.host}" '${remoteCmd}'`;

        await execAsync(sshCmd, { timeout: 30000 });

        onProgress(90, "远程发布命令执行完成...");
        logs.push(target.postDeployCommand ? "自定义发布后命令已执行" : "已尝试无交互重载 Nginx");
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        logs.push(`SSH 命令警告: ${msg}`);
        throw new Error(`SSH 连接失败: ${msg}`);
      }

      const url = target.publicUrl;
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
    this.register(new MockPreviewProvider());
    this.register(new VercelProvider());
    this.register(new MiaodaProvider());
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
