import { chromium } from "playwright";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:3002";
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || "acceptance-smoke@agenthub.local";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || "acceptance-smoke-2026";
const SELECTORS = {
  commandPalette: '[data-testid="command-palette"]',
  deployPanel: '[data-testid="deploy-panel"]',
};

const checks = [
  {
    name: "PMO 调度中枢",
    command: "查看 PMO 调度",
    text: "主 Agent 调度中枢",
  },
  {
    name: "失败降级与 Diff",
    command: "查看 Diff 与版本",
    text: "Diff 视图",
  },
  {
    name: "产物预览",
    command: "打开产物预览",
    text: "产物预览",
  },
  {
    name: "部署状态",
    command: "打开部署面板",
    text: "部署状态",
    deploy: true,
  },
];

async function waitForText(page, text) {
  await page.waitForFunction((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (node.nodeValue?.includes(needle)) {
        let element = node.parentElement;
        let visible = Boolean(element);

        while (element && element !== document.body) {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
            visible = false;
            break;
          }
          element = element.parentElement;
        }

        if (visible) return true;
      }
      node = walker.nextNode();
    }

    return false;
  }, text, { timeout: 10000 });
}

async function runCommand(page, query) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("command-palette:open")));
  await page.locator(SELECTORS.commandPalette).waitFor({ timeout: 10000 });
  const input = page.locator(`${SELECTORS.commandPalette} input`).first();
  await input.fill(query);
  await input.press("Enter");
}

async function requestAuth(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { response, data };
}

async function createOrLoginSmokeUser() {
  const registerPayload = {
    name: "Acceptance Smoke",
    email: SMOKE_EMAIL,
    password: SMOKE_PASSWORD,
  };
  const registered = await requestAuth("/api/auth/register", registerPayload);
  if (registered.response.ok && registered.data.token) {
    return registered.data.token;
  }

  const login = await requestAuth("/api/auth/login", {
    email: SMOKE_EMAIL,
    password: SMOKE_PASSWORD,
  });
  if (login.response.ok && login.data.token) {
    return login.data.token;
  }

  throw new Error(`Cannot create or login smoke user via ${API_URL}. Register: ${registered.response.status}; Login: ${login.response.status}`);
}

async function main() {
  let browser;
  try {
    const token = await createOrLoginSmokeUser();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });

    await context.addInitScript((authToken) => {
      localStorage.setItem("agenthub-auth-token", authToken);
      localStorage.setItem("agenthub-active-nav", "dashboard");
      localStorage.setItem("agenthub-sidebar-collapsed", "false");
    }, token);

    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForText(page, "AgentHub 工作台");
    await runCommand(page, "启动演示会话");
    await waitForText(page, "课题验收演示：多 Agent 协作");

    for (const check of checks) {
      await runCommand(page, check.command);
      await waitForText(page, check.text);
      if (check.deploy) {
        await page.locator(SELECTORS.deployPanel).waitFor({ timeout: 10000 });
        await page.locator('[data-testid="deploy-platform-mock-preview"]').click();
        await page.locator('[data-testid="deploy-start"]').click();
        await waitForText(page, "部署成功");
      }
    }

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      checked: checks.map((check) => check.name),
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      appUrl: APP_URL,
      message: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
