import pytest
from playwright.sync_api import sync_playwright

def test_frontend_routes_and_responsive():
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Test 1: Desktop 1440px
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # 1. Landing Page
        page.goto("http://localhost:5173/")
        assert "InfraScan" in page.title()
        assert page.locator("text=Infrastructure Scan").first.is_visible() or page.locator("img[alt='InfraScan']").first.is_visible()
        
        # 2. Login Page
        page.goto("http://localhost:5173/login")
        assert page.locator("input#email-input").is_visible()
        assert page.locator("input#password-input").is_visible()
        # Verify Google OAuth button is present
        page.locator("text=Continue with Google").wait_for(state="visible", timeout=5000)
        assert page.locator("text=Continue with Google").is_visible()
        
        # 3. Setup Page
        page.goto("http://localhost:5173/setup")
        assert page.locator("text=Platform Setup").first.is_visible()

        # 4. Register Page
        page.goto("http://localhost:5173/register")
        assert page.locator("input#reg-name").is_visible()
        assert page.locator("input#reg-email").is_visible()
        assert page.locator("input#reg-password").is_visible()
        
        # Ensure Administrator role is strictly NOT offered in self-registration (Check C2)
        body_text = page.locator("form").inner_text()
        assert "Administrator" not in body_text
        assert "Infrastructure Inspector" in body_text
        assert "Civil Engineer" in body_text
        
        # 5. Forgot Password Page
        page.goto("http://localhost:5173/forgot-password")
        assert page.locator("input#forgot-email").is_visible()
        
        # 6. Signed-Out Page (Check D4)
        page.goto("http://localhost:5173/signed-out")
        assert page.locator("text=Signed out").first.is_visible() or page.locator("text=Log in").first.is_visible()

        # 7. 404 Page (Check Q5)
        page.goto("http://localhost:5173/non-existent-page-route-1234")
        assert page.locator("text=Page not found").first.is_visible() or page.locator("text=404").first.is_visible()

        # 8. Legal Pages (Check Q4)
        page.goto("http://localhost:5173/privacy")
        assert page.locator("text=Privacy").first.is_visible()
        page.goto("http://localhost:5173/terms")
        assert page.locator("text=Terms").first.is_visible()


        # Test 2: Tablet 768px
        context_tablet = browser.new_context(viewport={"width": 768, "height": 1024})
        page_tablet = context_tablet.new_page()
        page_tablet.goto("http://localhost:5173/")
        assert "InfraScan" in page_tablet.title()
        
        # Test 3: Mobile 375px
        context_mobile = browser.new_context(viewport={"width": 375, "height": 667})
        page_mobile = context_mobile.new_page()
        page_mobile.goto("http://localhost:5173/")
        assert "InfraScan" in page_mobile.title()
        
        browser.close()


    # Verify no critical uncaught React/JS errors (401 is expected during initial silent refresh check when unauthenticated)
    critical_errors = [e for e in console_errors if "favicon" not in e.lower() and "404" not in e and "401" not in e]
    assert len(critical_errors) == 0, f"Encountered unexpected console errors: {critical_errors}"

if __name__ == "__main__":
    test_frontend_routes_and_responsive()
    print("Playwright UI responsive & routing tests passed across 375px, 768px, 1440px!")
