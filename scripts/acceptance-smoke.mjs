import { chromium } from "playwright";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:3002";
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || "acceptance-smoke@agenthub.local";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || "acceptance-smoke-2026";

const requiredTexts = [
  { name: "工作台首页", text: "多 Agent 协作项目控制台" },
  { name: "任务队列", text: "任务队列" },
  { name: "Agent 状态", text: "Agent 状态" },
  { name: "接入 Agent", text: "接入 Agent" },
];

const removedEntryTexts = [
  "快速跳转",
  "快速分配",
  "启动演示会话",
  "协作演示会话",
  "打开演示会话",
];

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

  throw new Error(
    `Cannot create or login smoke user via ${API_URL}. Register: ${registered.response.status}; Login: ${login.response.status}`,
  );
}

async function exposeSmokeHelpers(page) {
  await page.addInitScript(() => {
    window.__agenthubSmokeVisibleTextIncludes = (needle) => {
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

          if (visible) {
            return true;
          }
        }
        node = walker.nextNode();
      }

      return false;
    };
  });
}

async function waitForVisibleText(page, text) {
  await page.waitForFunction((needle) => window.__agenthubSmokeVisibleTextIncludes(needle), text, {
    timeout: 10000,
  });
}

async function expectTextNotVisible(page, text) {
  const visible = await page.evaluate((needle) => window.__agenthubSmokeVisibleTextIncludes(needle), text);
  if (visible) {
    throw new Error(`Removed UI entry is still visible: ${text}`);
  }
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
    await exposeSmokeHelpers(page);
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("aside").first().waitFor({ timeout: 10000 });

    for (const check of requiredTexts) {
      await waitForVisibleText(page, check.text);
    }

    for (const text of removedEntryTexts) {
      await expectTextNotVisible(page, text);
    }

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      checked: [...requiredTexts.map((check) => check.name), "演示入口已移除"],
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
