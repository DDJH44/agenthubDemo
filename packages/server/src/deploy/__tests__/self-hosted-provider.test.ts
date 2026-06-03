import { deployManager, ensureHtmlUtf8Meta } from "../index";

describe("Self-hosted deploy provider", () => {
  const envKeys = [
    "SELF_HOSTED_SSH_HOST",
    "SELF_HOSTED_SSH_PORT",
    "SELF_HOSTED_SSH_USER",
    "SELF_HOSTED_SSH_KEY",
    "SELF_HOSTED_DEPLOY_PATH",
    "SELF_HOSTED_PUBLIC_URL",
    "SELF_HOSTED_POST_DEPLOY_COMMAND",
  ];
  const originalEnv = new Map<string, string | undefined>();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    envKeys.forEach((key) => {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    });
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    envKeys.forEach((key) => {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    originalEnv.clear();
  });

  it("is registered as a deployment provider", () => {
    expect(deployManager.listProviders()).toEqual(
      expect.arrayContaining([{ id: "self-hosted", name: "自托管服务器" }])
    );
  });

  it("fails fast when server SSH environment is missing", async () => {
    const result = await deployManager.deploy(
      "self-hosted",
      "deploy-local",
      [{ path: "index.html", content: "<!DOCTYPE html><html><body>ok</body></html>" }],
      { projectName: "AgentHub Server" },
      () => {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("SELF_HOSTED_SSH_HOST");
    expect(result.error).toContain("SELF_HOSTED_SSH_USER");
  });

  it("injects an UTF-8 meta tag into HTML artifacts before deployment", () => {
    const result = ensureHtmlUtf8Meta({
      path: "index.html",
      content: "<!doctype html><html><head><title>测试</title></head><body>中文</body></html>",
    });

    expect(result.content).toContain('<meta charset="utf-8">');
    expect(result.content.indexOf('<meta charset="utf-8">')).toBeLessThan(result.content.indexOf("<title>"));
  });

  it("keeps existing charset meta tags unchanged", () => {
    const source = '<!doctype html><html><head><meta charset="UTF-8"><title>ok</title></head><body>中文</body></html>';
    const result = ensureHtmlUtf8Meta({ path: "index.html", content: source });

    expect(result.content).toBe(source);
  });
});
