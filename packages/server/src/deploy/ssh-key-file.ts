import { execFileSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { userInfo } from "os";
import { join } from "path";

function runIcacls(args: string[]): boolean {
  try {
    execFileSync("icacls", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function currentWindowsPrincipals(): string[] {
  const names = new Set<string>();
  const username = process.env.USERNAME || userInfo().username;
  const userdomain = process.env.USERDOMAIN;
  if (username) names.add(username);
  if (username && userdomain) names.add(`${userdomain}\\${username}`);
  return Array.from(names);
}

function hardenWindowsKeyAcl(keyPath: string): void {
  runIcacls([keyPath, "/inheritance:r"]);
  for (const principal of [
    "Everyone",
    "Users",
    "Authenticated Users",
    "BUILTIN\\Users",
    "*S-1-1-0",
    "*S-1-5-11",
    "*S-1-5-32-545",
  ]) {
    runIcacls([keyPath, "/remove:g", principal]);
    runIcacls([keyPath, "/remove:d", principal]);
  }

  const granted = currentWindowsPrincipals().some((principal) => runIcacls([keyPath, "/grant:r", `${principal}:F`]));
  if (!granted) {
    runIcacls([keyPath, "/grant:r", `${userInfo().username}:F`]);
  }
}

export function writeTemporarySshKey(baseDir: string, id: string, privateKey: string): { path: string; cleanup: () => void } {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const keyPath = join(baseDir, `${safeId}.key`);
  writeFileSync(keyPath, privateKey, { encoding: "utf8", mode: 0o600 });
  if (process.platform === "win32") {
    hardenWindowsKeyAcl(keyPath);
  } else {
    chmodSync(keyPath, 0o600);
  }

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
