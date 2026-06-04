import { getDeployProviderLabel } from "../deploy-platforms";

describe("deploy provider labels", () => {
  it("maps built-in provider ids to user-facing labels", () => {
    expect(getDeployProviderLabel("self-hosted")).toBe("服务器发布");
    expect(getDeployProviderLabel("mock-preview")).toBe("静态预览");
    expect(getDeployProviderLabel("vercel")).toBe("Vercel");
    expect(getDeployProviderLabel("miaoda")).toBe("Miaoda");
  });

  it("keeps custom provider names readable", () => {
    expect(getDeployProviderLabel("custom-cloud")).toBe("custom-cloud");
    expect(getDeployProviderLabel("  self-hosted  ")).toBe("服务器发布");
    expect(getDeployProviderLabel("")).toBe("部署目标");
  });
});
