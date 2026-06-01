from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='d:/agenthubDemo/frontend-screenshot.png', full_page=True)
    print("Screenshot saved to d:/agenthubDemo/frontend-screenshot.png")
    
    # Get page title and console logs
    print(f"Page title: {page.title()}")
    
    # Check for any JS errors in console
    page.on("console", lambda msg: print(f"Console: {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page error: {err}"))
    
    # Wait a bit for any dynamic content
    page.wait_for_timeout(2000)
    page.screenshot(path='d:/agenthubDemo/frontend-screenshot-after-wait.png', full_page=True)
    print("Screenshot after wait saved")
    
    browser.close()
