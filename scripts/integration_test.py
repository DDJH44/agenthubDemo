"""AgentHub Phase 1 集成验证测试 v4"""
from playwright.sync_api import sync_playwright
import os, sys, time, json, urllib.request

BASE = "http://localhost:3000"
API = "http://localhost:3002"
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test-screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

results = []

def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((name, status, detail))
    icon = "OK" if condition else "FAIL"
    print(f"  [{icon}] {name}" + (f" - {detail}" if detail else ""))

def screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)

def api_post(path, data):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def dump_state(page, label):
    try:
        url = page.url
        title = page.title()
        body = page.evaluate("() => document.body ? document.body.innerText.slice(0, 400) : 'NO BODY'")
        print(f"  [{label}] URL={url} | title={title}")
        print(f"  [{label}] body: {body}")
    except Exception as e:
        print(f"  [{label}] ERROR: {e}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))

    # ═══ 1. 页面加载 ═══
    print("\n=== 1. 页面加载 ===")
    page.goto(BASE, timeout=15000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "01-login-page")
    check("页面可访问", "AgentHub" in page.title())
    check("跳转登录页", "/login" in page.url, page.url)

    # ═══ 2. API 注册/登录 ═══
    print("\n=== 2. 认证 ===")
    ts = int(time.time() * 1000) % 100000
    email = f"test{ts}@agent.hub"
    name = f"TestUser{ts}"
    password = "test123456"
    token = None

    # Step 1: Try register
    print(f"  API 注册: {email}")
    resp = api_post("/api/auth/register", {"name": name, "email": email, "password": password})
    print(f"  Register response: {resp}")
    if resp.get("token"):
        token = resp["token"]
        check("API 注册成功", True)
    elif "already" in str(resp).lower() or "exist" in str(resp).lower() or resp.get("statusCode") == 409:
        check("API 注册 - 用户已存在", True)
    else:
        check("API 注册", False, str(resp))

    # Step 2: Login if no token from register
    if not token:
        print(f"  API 登录: {email}")
        resp = api_post("/api/auth/login", {"email": email, "password": password})
        print(f"  Login response: {resp}")
        if isinstance(resp, dict):
            token = resp.get("token") or resp.get("access_token") or resp.get("data", {}).get("token")
    check("认证获取 token", bool(token), "OK" if token else "FAIL")

    # Step 3: Inject token into page & reload
    if token:
        page.evaluate("(t) => { localStorage.setItem('agenthub-auth-token', t); }", token)
        page.goto(BASE, timeout=15000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
    else:
        print("  WARN: No token, attempting DOM login...")
        # Fallback: fill login form
        reg_tab = page.locator("text=注册").first
        if reg_tab.count() > 0 and reg_tab.is_visible():
            reg_tab.click()
            page.wait_for_timeout(500)
        all_inputs = page.locator("input").all()
        for inp in all_inputs:
            try:
                tp = inp.get_attribute("type") or ""
                if tp == "password":
                    inp.fill(password)
                elif tp == "email" or tp == "text" or not tp:
                    val = inp.get_attribute("placeholder") or ""
                    if "name" in val.lower() or "姓名" in val:
                        inp.fill(name)
                    elif "email" in val.lower() or "邮箱" in val:
                        inp.fill(email)
                    elif "name" not in val.lower() and "email" not in val.lower():
                        inp.fill(email)
            except:
                pass
        for btn_txt in ["创建账户", "Create Account"]:
            btn = page.locator(f"button:has-text('{btn_txt}')").first
            if btn.count() > 0 and btn.is_visible():
                btn.click()
                break
        page.wait_for_timeout(4000)
        page.wait_for_load_state("networkidle")
        if "/login" in page.url:
            page.locator("text=登录").first.click()
            page.wait_for_timeout(500)
            all_inputs = page.locator("input").all()
            for inp in all_inputs:
                try:
                    tp = inp.get_attribute("type") or ""
                    if tp == "password": inp.fill(password)
                    else: inp.fill(email)
                except: pass
            page.locator("button:has-text('登录')").first.click()
            page.wait_for_timeout(4000)
            page.wait_for_load_state("networkidle")

    screenshot(page, "02-after-auth")

    current_url = page.url
    on_main = "/login" not in current_url
    check("进入主页", on_main, current_url)
    dump_state(page, "after-auth")

    if not on_main:
        print("\n  ⚠️ 仍停留在登录页，跳过后续 UI 测试")
        browser.close()
        print(f"\n通过: {sum(1 for _,s,_ in results if s=='PASS')}/{len(results)}")
        sys.exit(1)

    # ═══ 3. 侧边栏 Logo ═══
    print("\n=== 3. 侧边栏 ===")
    logo = page.locator('h1:has-text("AgentHub"), img[alt*="AgentHub"], img[src*="agenthub-logo"]').first
    check("Logo 存在", logo.count() > 0)

    nav_or_aside = page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar'], [class*='sideNav']").first
    check("导航容器存在", nav_or_aside.count() > 0)

    # ═══ 4. Dashboard 视图 ═══
    print("\n=== 4. Dashboard ===")
    hero = page.locator("text=今天想让 AgentHub").first
    check("Hero 文字存在", hero.count() > 0)

    tasks = page.locator("text=我的任务").first
    check("任务区域存在", tasks.count() > 0)

    timeline = page.locator("text=协作动态").first
    check("协作动态存在", timeline.count() > 0)

    screenshot(page, "03-dashboard")

    # ═══ 5. 会话列表 ═══
    print("\n=== 5. 会话列表 ===")
    create_btn = page.locator('button[title="新建会话"], button:has-text("新建会话"), button:has-text("新建")').first
    btn_visible = create_btn.count() > 0 and create_btn.is_visible()
    check("新建会话按钮存在", btn_visible)

    mode_single = page.locator("text=单聊").count()
    mode_group = page.locator("text=群聊").count()
    check("会话模式 Tab 存在", mode_single > 0 or mode_group > 0, f"单聊:{mode_single} 群聊:{mode_group}")

    screenshot(page, "04-conv-list")

    # ═══ 6. 创建会话 ═══
    print("\n=== 6. 创建会话 ===")
    conv_id = f"test-conv-{ts}"
    conv_title = f"集成测试会话-{ts}"

    # Use the page's WS connection to create conversation
    result = page.evaluate("({id, title}) => { try { window.dispatchEvent(new CustomEvent('dashboard:send', { detail: { text: 'CREATE_CONV:' + id + ':' + title } })); return 'event-dispatched'; } catch(e) { return 'error:' + e.message; } }", {"id": conv_id, "title": conv_title})
    print(f"  Create result: {result}")

    # Click the create button to open modal and create conversation
    if create_btn.count() > 0 and create_btn.is_visible():
        create_btn.click()
        page.wait_for_timeout(1000)
    
    # Fill conversation name in modal
    name_inputs = page.locator("input").all()
    for inp in name_inputs:
        try:
            ph = inp.get_attribute("placeholder") or ""
            if "会话" in ph or "名称" in ph or "留空" in ph or "Conversation" in ph:
                inp.fill(conv_title)
                break
        except: pass
    
    # Click group chat mode
    group_btn = page.locator("text=群聊").first
    if group_btn.count() > 0 and group_btn.is_visible():
        group_btn.click()
        page.wait_for_timeout(300)
    
    # Click create/confirm - search all visible buttons in the page
    for btn_txt in ["创建群聊", "开始单聊", "创建", "Create", "开始"]:
        btn = page.locator(f"button:has-text('{btn_txt}')").first
        if btn.count() > 0 and btn.is_visible():
            btn.click()
            print(f"  Clicked: {btn_txt}")
            break
    else:
        # Fallback: get ALL visible buttons and click last one that's not Cancel
        all_btns = page.locator("button").all()
        for b in reversed(all_btns):
            try:
                txt = b.inner_text()
                if txt and b.is_visible() and "取消" not in txt and "新建" not in txt:
                    b.click()
                    print(f"  Fallback clicked: {txt}")
                    break
            except: pass

    page.wait_for_timeout(3000)
    page.wait_for_load_state("networkidle")
    dump_state(page, "after-create")
    screenshot(page, "05-after-create")

    conv_in_list = page.locator(f"text={conv_title}").count()
    check("会话已添加到列表", conv_in_list > 0, f"找到 {conv_in_list} 处")

    # ═══ 7. 右侧上下文面板 ═══
    print("\n=== 7. 上下文面板 ===")
    ctx_project = page.locator("text=当前项目").count()
    ctx_files = page.locator("text=项目文件").count()
    ctx_recent = page.locator("text=最近动态").count()
    ctx_blocks = ctx_project + ctx_files + ctx_recent
    check("上下文面板有内容区块", ctx_blocks > 0, f"项目:{ctx_project} 文件:{ctx_files} 动态:{ctx_recent}")
    screenshot(page, "06-context-panel")

    # ═══ 8. JS 错误 ═══
    print("\n=== 8. JS 运行时错误 ===")
    js_errors = [e for e in errors if "vite" not in e.lower() and "HMR" not in e and "favicon" not in e]
    check("无关键 JS 错误", len(js_errors) == 0, js_errors[:3] if js_errors else "")
    if js_errors:
        for e in js_errors[:5]:
            print(f"    {e[:200]}")

    # ═══ 9. localStorage 持久化 ═══
    print("\n=== 9. localStorage 持久化 ===")
    ls = page.evaluate("() => { const keys = Object.keys(localStorage).filter(function(k) { return k.startsWith ? k.startsWith('agenthub-') : k.indexOf('agenthub-') === 0; }); const data = {}; for (var i=0; i<keys.length; i++) { var v = localStorage.getItem(keys[i]); data[keys[i]] = v ? v.slice(0,80) : null; } return { keys: keys, data: data, token: !!localStorage.getItem('agenthub-auth-token') }; }")
    print(f"  localStorage keys: {ls['keys']}")
    check("auth token 持久化", ls.get("token", False))
    check("conversations 持久化", any("conversations" in k for k in ls.get("keys", [])))

    # ═══ 10. 按钮和交互性 ═══
    print("\n=== 10. 交互性 ===")
    btn_count = page.evaluate("() => document.querySelectorAll('button').length")
    check("页面按钮存在", btn_count > 5, f"共 {btn_count} 个")

    screenshot(page, "07-final")

    browser.close()

# ── 汇总 ──
print("\n" + "=" * 60)
passed = sum(1 for _, s, _ in results if s == "PASS")
total = len(results)
for name, status, detail in results:
    icon = "✅" if status == "PASS" else "❌"
    print(f"  {icon} {name}" + (f" ({detail})" if detail and status == "FAIL" else ""))
print(f"\n通过: {passed}/{total}  失败: {total - passed}/{total}")
sys.exit(0 if passed == total else 1)
