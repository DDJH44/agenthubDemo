const DEPLOY_PROVIDER_LABELS: Record<string, string> = {
  "self-hosted": "服务器发布",
  "mock-preview": "静态预览",
  vercel: "Vercel",
  miaoda: "Miaoda",
};

export function getDeployProviderLabel(providerId?: string | null) {
  const normalized = providerId?.trim();
  if (!normalized) return "部署目标";
  return DEPLOY_PROVIDER_LABELS[normalized] ?? normalized;
}
