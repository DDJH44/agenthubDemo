export interface User { id: string; name: string; email: string; avatarUrl?: string; createdAt: number; }
export interface Workspace { id: string; name: string; ownerId: string; createdAt: number; }
export type WorkspaceRole = "owner" | "admin" | "member";
export interface WorkspaceMember { id: string; workspaceId: string; userId: string; role: WorkspaceRole; }
