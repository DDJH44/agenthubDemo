const DEPLOY_PROVIDER_LABELS: Record<string, string> = {
  "self-hosted": "静态站点部署",
  "local-preview": "预览 URL",
  "static-download": "源码打包下载",
  "container-package": "容器化部署包",
  vercel: "Vercel",
  miaoda: "Miaoda",
};

export function getDeployProviderLabel(providerId?: string | null) {
  const normalized = providerId?.trim();
  if (!normalized) return "部署目标";
  return DEPLOY_PROVIDER_LABELS[normalized] ?? normalized;
}
