import { randomUUID } from "crypto";
import { prisma } from "../index";

export interface DeploymentTargetRecord {
  id: string;
  userId: string;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  deployPath: string;
  publicUrl: string;
  authType: string;
  publicKey: string;
  privateKeyEncrypted: string;
  postDeployCommand: string | null;
  status: string;
  lastTestedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapTarget(row: Record<string, unknown>): DeploymentTargetRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: String(row.type),
    host: String(row.host),
    port: Number(row.port),
    username: String(row.username),
    deployPath: String(row.deploy_path),
    publicUrl: String(row.public_url),
    authType: String(row.auth_type),
    publicKey: String(row.public_key),
    privateKeyEncrypted: String(row.private_key_encrypted),
    postDeployCommand: row.post_deploy_command ? String(row.post_deploy_command) : null,
    status: String(row.status),
    lastTestedAt: row.last_tested_at ? new Date(String(row.last_tested_at)) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export const deploymentTargetRepo = {
  async listByUser(userId: string): Promise<DeploymentTargetRecord[]> {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM deployment_targets WHERE user_id = $1 ORDER BY created_at DESC",
      userId
    );
    return rows.map(mapTarget);
  },

  async getById(id: string): Promise<DeploymentTargetRecord | null> {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM deployment_targets WHERE id = $1 LIMIT 1",
      id
    );
    return rows[0] ? mapTarget(rows[0]) : null;
  },

  async create(data: {
    id?: string;
    userId: string;
    name: string;
    host: string;
    port: number;
    username: string;
    deployPath: string;
    publicUrl: string;
    publicKey: string;
    privateKeyEncrypted: string;
    postDeployCommand?: string | null;
  }): Promise<DeploymentTargetRecord> {
    const id = data.id ?? randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO deployment_targets (
        id, user_id, name, type, host, port, username, deploy_path, public_url,
        auth_type, public_key, private_key_encrypted, post_deploy_command, status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'self-hosted', $4, $5, $6, $7, $8,
        'agenthub-key', $9, $10, $11, 'pending',
        NOW(), NOW()
      )`,
      id,
      data.userId,
      data.name,
      data.host,
      data.port,
      data.username,
      data.deployPath,
      data.publicUrl,
      data.publicKey,
      data.privateKeyEncrypted,
      data.postDeployCommand ?? null
    );

    const target = await this.getById(id);
    if (!target) throw new Error("Failed to create deployment target");
    return target;
  },

  async updateStatus(id: string, status: string, error?: string | null): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE deployment_targets
       SET status = $2, last_error = $3, last_tested_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      id,
      status,
      error ?? null
    );
  },

  async delete(id: string): Promise<void> {
    await prisma.$executeRawUnsafe("DELETE FROM deployment_targets WHERE id = $1", id);
  },
};
