import { getDeployProviderLabel } from "../deploy-platforms";

describe("deploy provider labels", () => {
  it("maps built-in provider ids to user-facing labels", () => {
    expect(getDeployProviderLabel("self-hosted")).toBe("静态站点部署");
    expect(getDeployProviderLabel("mock-preview")).toBe("预览 URL");
    expect(getDeployProviderLabel("static-download")).toBe("源码打包下载");
    expect(getDeployProviderLabel("container-package")).toBe("容器化部署包");
    expect(getDeployProviderLabel("vercel")).toBe("Vercel");
    expect(getDeployProviderLabel("miaoda")).toBe("Miaoda");
  });

  it("keeps custom provider names readable", () => {
    expect(getDeployProviderLabel("custom-cloud")).toBe("custom-cloud");
    expect(getDeployProviderLabel("  self-hosted  ")).toBe("静态站点部署");
    expect(getDeployProviderLabel("")).toBe("部署目标");
  });
});
