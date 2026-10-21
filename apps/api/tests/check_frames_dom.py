from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:5173/login')
    page.fill('input#email-input', 'inspector@infrascan.local')
    page.fill('input#password-input', 'TestPass123!@#')
    page.click("button[type='submit']")
    page.wait_for_timeout(2000)
    page.goto('http://localhost:5173/app/inspections/INSP-001')
    page.wait_for_timeout(2000)
    print('ALL TABS:', page.locator('[role="tab"]').all_inner_texts())
    
    # Click Frames tab
    page.locator('[role="tab"]:has-text("Frames")').click()
    page.wait_for_timeout(1000)
    
    buttons = [b.strip() for b in page.locator('button').all_inner_texts() if b.strip()]
    print('BUTTONS IN FRAMES TAB:', buttons)
    browser.close()
