export interface DeploymentTarget {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  deployPath: string;
  publicUrl: string;
  authType?: string;
  publicKey?: string;
  postDeployCommand?: string;
  status?: string;
  configured?: boolean;
  requiredEnv?: string[];
  optionalEnv?: string[];
  missingEnv?: string[];
  envTemplate?: string;
  lastTestedAt?: string | null;
  lastError?: string | null;
}

export interface DeploymentTargetsResponse {
  defaultTarget: DeploymentTarget | null;
  targets: DeploymentTarget[];
}

export function isDeploymentTargetConfigured(target?: DeploymentTarget | null) {
  if (!target) return false;
  if (target.configured === true || target.status === "ready") return true;
  if (target.configured === false || target.status === "unconfigured") return false;
  if ((target.missingEnv?.length ?? 0) > 0) return false;
  return Boolean(target.host && target.username && target.deployPath && target.publicUrl);
}

export function deploymentTargetStatusLabel(target?: DeploymentTarget | null, loading = false, error?: string | null) {
  if (loading) return "读取中";
  if (error) return "读取失败";
  return isDeploymentTargetConfigured(target) ? "可用" : "缺少配置";
}
