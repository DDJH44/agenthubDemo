import type { Artifact } from "@agenthub/shared";

export interface DeployFile {
  path: string;
  content: string;
}

function rootArtifactId(artifact: Artifact) {
  return artifact.parentId ?? artifact.id;
}

function artifactVersion(artifact: Artifact) {
  return artifact.version ?? 1;
}

export function latestDeployArtifacts(artifacts: Artifact[]) {
  const grouped = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    if (!artifact.content?.trim()) continue;
    const rootId = rootArtifactId(artifact);
    const current = grouped.get(rootId);
    if (
      !current ||
      artifactVersion(artifact) > artifactVersion(current) ||
      (artifactVersion(artifact) === artifactVersion(current) && artifact.createdAt > current.createdAt)
    ) {
      grouped.set(rootId, artifact);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aHtml = a.type === "html" || a.filename?.endsWith(".html");
    const bHtml = b.type === "html" || b.filename?.endsWith(".html");
    if (aHtml !== bHtml) return aHtml ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export function filePathForArtifact(artifact: Artifact, index: number) {
  const fallback = artifact.type === "html" ? "index.html" : `${artifact.type || "artifact"}-${index + 1}.txt`;
  const value = (artifact.filename || fallback).replace(/\\/g, "/").replace(/^\/+/, "").trim();
  return value || fallback;
}

function filePathWithSuffix(path: string, suffix: number) {
  if (suffix <= 1) return path;
  const slashIndex = path.lastIndexOf("/");
  const dir = slashIndex >= 0 ? `${path.slice(0, slashIndex + 1)}` : "";
  const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = name.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const stem = hasExtension ? name.slice(0, dotIndex) : name;
  const extension = hasExtension ? name.slice(dotIndex) : "";
  return `${dir}${stem}-${suffix}${extension}`;
}

function uniqueFilePath(path: string, seen: Map<string, number>) {
  let suffix = (seen.get(path) ?? 0) + 1;
  let candidate = filePathWithSuffix(path, suffix);

  while (seen.has(candidate)) {
    suffix += 1;
    candidate = filePathWithSuffix(path, suffix);
  }

  seen.set(path, suffix);
  seen.set(candidate, 1);
  return candidate;
}

export function collectDeployFiles(artifacts: Artifact[]): DeployFile[] {
  const seenPaths = new Map<string, number>();
  return latestDeployArtifacts(artifacts).map((artifact, index) => ({
    path: uniqueFilePath(filePathForArtifact(artifact, index), seenPaths),
    content: artifact.content,
  }));
}

export function pickDeployArtifact(artifacts: Artifact[]) {
  const latest = latestDeployArtifacts(artifacts);
  return (
    latest.find((artifact) => artifact.type === "html" || artifact.filename?.endsWith(".html")) ??
    latest.find((artifact) => artifact.type === "code") ??
    latest[0]
  );
}
