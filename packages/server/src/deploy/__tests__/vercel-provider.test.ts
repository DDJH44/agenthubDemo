import { deployManager } from "../index";

describe("Vercel deploy provider", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.VERCEL_POLL_INTERVAL_MS = "1";
    process.env.VERCEL_MAX_POLLS = "2";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    global.fetch = originalFetch;
    delete process.env.VERCEL_POLL_INTERVAL_MS;
    delete process.env.VERCEL_MAX_POLLS;
  });

  it("creates Vercel deployments with inline files and polls readyState", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "dpl_123", url: "agenthub-test.vercel.app" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ readyState: "READY", url: "agenthub-test.vercel.app" }), { status: 200 }));

    const result = await deployManager.deploy(
      "vercel",
      "deploy-123",
      [{ path: "index.html", content: "<!DOCTYPE html><html><body>ok</body></html>" }],
      { projectName: "AgentHub Smoke", vercelToken: "test-token" },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://agenthub-test.vercel.app");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.vercel.com/v13/deployments");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/files"))).toBe(false);

    const createBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(createBody.name).toBe("agenthub-smoke");
    expect(createBody.files).toHaveLength(1);
    expect(createBody.files[0].file).toBe("index.html");
    expect(createBody.files[0].data).toContain('<meta charset="utf-8">');
    expect(createBody.files[0].data).toContain("<body>ok</body>");
  });

  it("returns a failed result when Vercel reports an error readyState", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "dpl_456", url: "agenthub-error.vercel.app" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ readyState: "ERROR", errorMessage: "Build failed" }), { status: 200 }));

    const result = await deployManager.deploy(
      "vercel",
      "deploy-456",
      [{ path: "index.html", content: "<html></html>" }],
      { projectName: "AgentHub Error", vercelToken: "test-token" },
      () => {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Build failed");
  });
});
