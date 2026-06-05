import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { deployManager } from "../index";

describe("Container package deploy provider", () => {
  const deployId = `container-package-test-${Date.now()}`;
  const deployDir = join(process.cwd(), "deploy-output", deployId);

  afterEach(() => {
    rmSync(deployDir, { recursive: true, force: true });
  });

  it("is registered as a deployment provider", () => {
    expect(deployManager.listProviders()).toEqual(
      expect.arrayContaining([{ id: "container-package", name: "容器化部署包" }])
    );
  });

  it("generates a Docker-ready static site package", async () => {
    const result = await deployManager.deploy(
      "container-package",
      deployId,
      [{ path: "index.html", content: "<!doctype html><html><body>ok</body></html>" }],
      { projectName: "AgentHub Fireworks" },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(result.url).toBe(`/api/download/${deployId}`);
    expect(existsSync(join(deployDir, "Dockerfile"))).toBe(true);
    expect(existsSync(join(deployDir, "nginx.conf"))).toBe(true);
    expect(readFileSync(join(deployDir, "README.md"), "utf-8")).toContain("docker build -t agenthub-fireworks .");
  });
});
