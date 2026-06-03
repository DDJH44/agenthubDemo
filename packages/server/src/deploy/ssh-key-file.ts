import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

export function writeTemporarySshKey(baseDir: string, id: string, privateKey: string): { path: string; cleanup: () => void } {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const keyPath = join(baseDir, `${safeId}.key`);
  writeFileSync(keyPath, privateKey, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(keyPath, 0o600);

  return {
    path: keyPath,
    cleanup: () => {
      try {
        if (existsSync(keyPath)) unlinkSync(keyPath);
      } catch {
        // Best-effort cleanup.
      }
    },
  };
}
