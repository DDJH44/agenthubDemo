from playwright.sync_api import sync_playwright
import json, urllib.request, os

print("1. 注册新测试账号")
data = json.dumps({"name":"verify","email":"verify@test.com","password":"abc123456"}).encode()
req = urllib.request.Request("http://localhost:3002/api/auth/register", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=5)
    result = json.loads(resp.read())
    print(f"  ✅ 注册成功: {result.get('user',{}).get('email','?')}")
except Exception as e:
    body = getattr(e, 'read', lambda: b'')()
    print(f"  ℹ️ {getattr(e,'code',0)} {body.decode()[:200]}")

print()

# API login to get token
print("2. API 登录获取 token")
data = json.dumps({"email":"verify@test.com","password":"abc123456"}).encode()
req = urllib.request.Request("http://localhost:3002/api/auth/login", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=5)
    result = json.loads(resp.read())
    token = result["token"]
    print(f"  ✅ token={token[:24]}...")
except Exception as e:
    body = getattr(e, 'read', lambda: b'')()
    print(f"  ❌ {e} {body.decode()[:200]}")
    token = None

if not token:
    print("\n登录失败，停止")
    exit(1)

print()
print("3. 前端页面验证 (注入 token)")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error","warning") else None)

    # Inject token into localStorage, then go to main page
    page.goto("http://localhost:3000/", wait_until="networkidle", timeout=15000)
    page.evaluate(f"localStorage.setItem('agenthub-auth-token', '{token}')")
    page.goto("http://localhost:3000/", wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(3000)

    url = page.url
    print(f"  URL: {url}")

    if url == "http://localhost:3000/":
        print("  ✅ 成功进入主页")
        page.screenshot(path="d:/agenthubDemo/verification_dashboard.png", full_page=True)

        # Check all headings
        headings = page.locator("h1,h2,h3").all()
        for h in headings[:20]:
            txt = h.inner_text().strip()
            if txt:
                print(f"    标题: {txt[:60]}")

        # Check nav items
        for btn in page.locator("button").all():
            txt = btn.inner_text().strip()
            if txt and len(txt) < 15:
                print(f"    按钮: {txt}")

        # Check stat cards on dashboard (default view)
        page.screenshot(path="d:/agenthubDemo/verification_main.png", full_page=True)
        
        # Click on "工作台" if possible
        try:
            page.click("text=工作台", timeout=3000)
            page.wait_for_timeout(2000)
            page.screenshot(path="d:/agenthubDemo/verification_workspace.png", full_page=True)
            print("  ✅ 已切换到工作台视图")
        except:
            print("  ℹ️ 默认已显示工作台")

        print(f"  JS errors/warnings: {errors[:5] if errors else '无'}")

        # Check page title
        print(f"  页面 title: {page.title()}")
    else:
        print(f"  ❌ 未进入主页，当前 URL: {url}")

    browser.close()

print()
print("=" * 50)
print("验证结果")
for name in ["verification_main.png","verification_dashboard.png","verification_workspace.png"]:
    p = f"d:/agenthubDemo/{name}"
    print(f"  {'✅' if os.path.exists(p) else '⚠️'} {name} ({os.path.getsize(p)} bytes)" if os.path.exists(p) else f"  ⚠️ {name} 未生成")
