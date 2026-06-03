import type { Artifact } from "@agenthub/shared";
import { collectDeployFiles, latestDeployArtifacts, pickDeployArtifact } from "../deploy-artifacts";

function artifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: "artifact-1",
    jobId: "job-1",
    type: "html",
    filename: "index.html",
    content: "<html>old</html>",
    createdAt: 1,
    ...overrides,
  };
}

describe("deploy artifacts", () => {
  it("deploys only the latest version from one artifact lineage", () => {
    const files = collectDeployFiles([
      artifact({ id: "root", version: 1, content: "<html>old</html>", createdAt: 10 }),
      artifact({ id: "v2", parentId: "root", version: 2, content: "<html>new</html>", createdAt: 20 }),
    ]);

    expect(files).toEqual([{ path: "index.html", content: "<html>new</html>" }]);
  });

  it("keeps duplicate filenames unique only across different artifact lineages", () => {
    const files = collectDeployFiles([
      artifact({ id: "page-a", content: "<html>a</html>", createdAt: 20 }),
      artifact({ id: "page-b", content: "<html>b</html>", createdAt: 10 }),
    ]);

    expect(files).toEqual([
      { path: "index.html", content: "<html>a</html>" },
      { path: "index-2.html", content: "<html>b</html>" },
    ]);
  });

  it("lets the newest same-name html artifact keep index.html", () => {
    const files = collectDeployFiles([
      artifact({ id: "old-page", content: "<html>old</html>", createdAt: 10 }),
      artifact({ id: "new-page", content: "<html>new</html>", createdAt: 30 }),
    ]);

    expect(files[0]).toEqual({ path: "index.html", content: "<html>new</html>" });
    expect(files[1]).toEqual({ path: "index-2.html", content: "<html>old</html>" });
  });

  it("prefers the latest deployable html artifact", () => {
    const artifacts = [
      artifact({ id: "root", type: "code", filename: "main.js", content: "console.log('old')", version: 1, createdAt: 10 }),
      artifact({ id: "html-v2", parentId: "root", type: "html", filename: "index.html", content: "<html>new</html>", version: 2, createdAt: 20 }),
    ];

    expect(latestDeployArtifacts(artifacts)).toHaveLength(1);
    expect(pickDeployArtifact(artifacts)?.content).toBe("<html>new</html>");
  });
});
