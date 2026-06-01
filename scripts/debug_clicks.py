from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: console_logs.append(f"PageError: {err}"))
    
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    
    # Get full page screenshot
    page.screenshot(path='d:/agenthubDemo/frontend-debug-click.png', full_page=True)
    print("Screenshot saved")
    print(f"Page title: {page.title()}")
    
    # Check if GlobalErrorBoundary is showing
    error_boundary = page.locator('text="捕获到浏览器 JS 运行时错误"').first
    if error_boundary.count() > 0:
        print("⚠ GlobalErrorBoundary is showing an error!")
        error_text = page.locator('pre').first.inner_text()
        print(f"Error: {error_text[:500]}")
    else:
        print("✓ No error boundary showing")
    
    # Check if there's an invisible overlay
    body = page.locator('body').first
    body_box = body.bounding_box()
    print(f"Body bounds: {body_box}")
    
    # Try clicking the "新建会话" button
    button = page.locator('text="新建会话"').first
    if button.count() > 0:
        print("✓ '新建会话' button found")
        button.click()
        page.wait_for_timeout(1000)
        print("✓ Clicked '新建会话'")
        
        # Check if a new conversation was added
        new_conv = page.locator('text="新会话"').first
        if new_conv.count() > 0:
            print("✓ New conversation '新会话' appeared")
        else:
            print("✗ New conversation did NOT appear after click")
    else:
        print("✗ '新建会话' button NOT found")
    
    # Try typing in textarea
    textarea = page.locator('textarea[placeholder*="输入消息"]').first
    if textarea.count() > 0:
        print("✓ Textarea found")
        textarea.click()
        page.wait_for_timeout(500)
        textarea.fill("测试输入")
        page.wait_for_timeout(500)
        print(f"✓ Typed: {textarea.input_value()}")
    else:
        print("✗ Textarea NOT found")
    
    print(f"\nConsole logs ({len(console_logs)}):")
    for log in console_logs:
        print(f"  {log}")
    
    browser.close()
