"use client";

import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

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
  const targetConversationId = detail.conversationId ?? useChatStore.getState().activeConversationId;
  if (targetConversationId) {
    useChatStore.getState().setActiveConversation(targetConversationId);
    try {
      useWorkspaceStore.getState().switchConversation(targetConversationId);
    } catch {
      // Keep the jump-to-chat path alive even if workspace persistence is temporarily unavailable.
    }
    window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId: targetConversationId } }));
  }

  useChatStore.getState().setCurrentPreview({
    artifactId: detail.artifactId,
    type: detail.type,
    content: detail.content,
    filename: detail.filename,
  });
  useNavigationStore.getState().setActiveNav("chat");

  const tab = detail.tab ?? panelTabForArtifact(detail.type);
  const openPanel = () => {
    window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
    window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
  };
  window.setTimeout(openPanel, 0);
  window.setTimeout(openPanel, 80);
  window.setTimeout(openPanel, 500);
  window.setTimeout(openPanel, 1200);
  window.dispatchEvent(new CustomEvent<OpenArtifactRequestDetail>(OPEN_ARTIFACT_EVENT, { detail }));
}
