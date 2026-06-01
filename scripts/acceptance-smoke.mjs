import { chromium } from "playwright";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:3002";
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || "acceptance-smoke@agenthub.local";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || "acceptance-smoke-2026";
const SELECTORS = {
  guide: '[data-testid="acceptance-guide"]',
  reset: '[data-testid="acceptance-reset"]',
  navAcceptance: '[data-nav-key="acceptance"]',
};

const checks = [
  {
    name: "PMO 调度中枢",
    selector: '[data-testid="guide-item-pmo-orchestration"]',
    text: "主 Agent 调度中枢",
  },
  {
    name: "失败降级与 Diff",
    selector: '[data-testid="guide-item-fallback-conflict"]',
    text: "代码 Diff",
  },
  {
    name: "产物预览",
    selector: '[data-testid="guide-item-artifact-preview"]',
    text: "产物预览",
  },
  {
    name: "部署状态",
    selector: '[data-testid="guide-item-deploy"]',
    text: "部署状态",
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

async function openAcceptanceGuide(page) {
  await page.locator(SELECTORS.navAcceptance).first().click();
  await page.locator(SELECTORS.guide).waitFor({ timeout: 10000 });
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
      localStorage.setItem("agenthub-active-nav", "acceptance");
      localStorage.setItem("agenthub-sidebar-collapsed", "false");
    }, token);

    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(SELECTORS.guide).waitFor({ timeout: 15000 });
    await page.locator(SELECTORS.reset).click();
    await waitForText(page, "验收覆盖度");

    for (const check of checks) {
      await openAcceptanceGuide(page);
      await page.locator(check.selector).click();
      await waitForText(page, check.text);
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
