import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from "crypto";

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function sshString(value: string | Buffer): Buffer {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

function sshMpint(value: Buffer): Buffer {
  let body = value;
  while (body.length > 1 && body[0] === 0) body = body.subarray(1);
  if (body[0] & 0x80) body = Buffer.concat([Buffer.from([0]), body]);
  return sshString(body);
}

function credentialKey(): Buffer {
  const secret =
    process.env.DEPLOYMENT_TARGET_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.OPENAI_API_KEY ||
    "agenthub-development-only-secret";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted credential format");
  }
  const decipher = createDecipheriv(CIPHER, credentialKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateSshKeyPair(comment: string): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });

  const jwk = publicKey.export({ format: "jwk" }) as { e?: string; n?: string };
  if (!jwk.e || !jwk.n) {
    throw new Error("Failed to export SSH public key");
  }

  const blob = Buffer.concat([
    sshString("ssh-rsa"),
    sshMpint(base64UrlDecode(jwk.e)),
    sshMpint(base64UrlDecode(jwk.n)),
  ]).toString("base64");

  return {
    publicKey: `ssh-rsa ${blob} ${comment}`,
    privateKey: privateKey.export({ type: "pkcs1", format: "pem" }) as string,
  };
}
