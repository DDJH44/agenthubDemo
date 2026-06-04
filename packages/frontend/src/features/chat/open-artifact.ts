"use client";

export const OPEN_ARTIFACT_EVENT = "agenthub:artifact:open";

export type ArtifactPanelTab = "preview" | "code" | "slides" | "diff" | "deploy" | "context" | "history";

export interface OpenArtifactRequestDetail {
  artifactId: string;
  type: string;
  content: string;
  filename?: string;
  conversationId?: string | null;
  tab?: ArtifactPanelTab;
}

export function panelTabForArtifact(type: string): ArtifactPanelTab {
  if (type === "code" || type === "json" || type === "markdown") return "code";
  if (type === "slides") return "slides";
  return "preview";
}

export function requestOpenArtifact(detail: OpenArtifactRequestDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenArtifactRequestDetail>(OPEN_ARTIFACT_EVENT, { detail }));
}
