from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.on("request", lambda r: print("REQ:", r.method, r.url))
    page.on("response", lambda r: print("RES:", r.status, r.url))
    
    page.goto('http://localhost:5173/login')
    page.wait_for_selector('input#email-input')
    page.fill('input#email-input', 'inspector@infrascan.local')
    page.fill('input#password-input', 'TestPass123!@#')
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    print('AFTER LOGIN URL:', page.url)
    
    page.goto('http://localhost:5173/app/assets')
    page.wait_for_timeout(3000)
    print('AFTER GOTO ASSETS URL:', page.url)
    browser.close()
