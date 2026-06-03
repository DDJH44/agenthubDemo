import { decryptSecret, encryptSecret, generateSshKeyPair } from "../credentials";

describe("Deployment credentials", () => {
  const originalSecret = process.env.DEPLOYMENT_TARGET_SECRET;

  beforeEach(() => {
    process.env.DEPLOYMENT_TARGET_SECRET = "unit-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.DEPLOYMENT_TARGET_SECRET;
    } else {
      process.env.DEPLOYMENT_TARGET_SECRET = originalSecret;
    }
  });

  it("encrypts and decrypts SSH private key material", () => {
    const encrypted = encryptSecret("private-key-content");
    expect(encrypted).not.toContain("private-key-content");
    expect(decryptSecret(encrypted)).toBe("private-key-content");
  });

  it("generates an authorized_keys compatible public key", () => {
    const pair = generateSshKeyPair("agenthub-test");
    expect(pair.publicKey).toMatch(/^ssh-rsa [A-Za-z0-9+/=]+ agenthub-test$/);
    expect(pair.privateKey).toContain("BEGIN RSA PRIVATE KEY");
  });
});
