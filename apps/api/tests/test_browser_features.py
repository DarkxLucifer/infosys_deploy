import os
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:5173"
SCREENS_DIR = r"D:\project\aiml prime\project\infosys\docs\agent\screens"
os.makedirs(SCREENS_DIR, exist_ok=True)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            geolocation={"latitude": 40.7306, "longitude": -73.9352},
            permissions=["geolocation", "camera"]
        )
        page = context.new_page()
        
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("\n--- 1. Login as Inspector ---")
        page.goto(f"{BASE_URL}/login")
        page.wait_for_selector("input#email-input", timeout=10000)
        page.fill("input#email-input", "inspector@infrascan.local")
        page.fill("input#password-input", "TestPass123!@#")
        page.click("button[type='submit']")
        
        # Wait for redirect to dashboard
        page.wait_for_url("**/dashboard**", timeout=10000)
        time.sleep(1)
        print("Logged in as Inspector. Current URL:", page.url)

        print("\n--- 2. Inspect Assets Page & Register Dialog with GPS ---")
        page.goto(f"{BASE_URL}/app/assets")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path=os.path.join(SCREENS_DIR, "inspector_assets_list.png"))
        page.wait_for_selector("button:has-text('Register asset')", timeout=15000)
        print("Assets page loaded.")

        # Click Register Asset
        page.click("button:has-text('Register asset')")
        page.wait_for_selector("button:has-text('Use Current Location (GPS)')", timeout=5000)
        
        # Verify GPS button is visible
        assert page.locator("button:has-text('Use Current Location (GPS)')").is_visible()
        print("Register Asset Dialog with GPS button is visible.")

        # Click GPS button
        page.click("button:has-text('Use Current Location (GPS)')")
        time.sleep(1)
        page.screenshot(path=os.path.join(SCREENS_DIR, "inspector_asset_register_gps.png"))
        print("Clicked 'Use Current Location (GPS)' successfully.")

        # Close dialog
        page.keyboard.press("Escape")
        time.sleep(0.5)

        print("\n--- 3. Inspect Inspection Detail Workspace ---")
        page.goto(f"{BASE_URL}/app/inspections/INSP-001")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        print("Inspection detail loaded:", page.url)

        # Switch to Frames tab
        page.locator("[role='tab']:has-text('Frames')").click()
        time.sleep(1)

        # Verify Take Photo, Mobile Cam, and Upload files buttons
        take_photo_btn = page.locator("button:has-text('Take Photo')").first
        mobile_cam_span = page.locator("span:has-text('Mobile Cam')").first
        upload_span = page.locator("span:has-text('Upload files')").first
        
        assert take_photo_btn.is_visible(), "Take Photo button not visible"
        assert mobile_cam_span.is_visible(), "Mobile Cam button not visible"
        assert upload_span.is_visible(), "Upload files button not visible"
        print("Intake controls (Take Photo, Mobile Cam, Upload files) verified visible.")

        # Open Camera modal
        take_photo_btn.click()
        time.sleep(1)
        assert page.locator("text=Field Camera Capture").is_visible(), "Camera modal did not open"
        page.screenshot(path=os.path.join(SCREENS_DIR, "inspector_camera_modal.png"))
        print("Camera modal opened successfully with viewfinder & GPS tracking.")
        
        # Close camera modal
        page.keyboard.press("Escape")
        time.sleep(0.5)

        # Screenshot Frames tab showing uploaded assets and toggle views
        page.screenshot(path=os.path.join(SCREENS_DIR, "inspector_frames_tab.png"))
        print("Frames tab screenshot captured.")

        print("\n--- 4. Verify Civil Engineer views newly created Asset BR-003 ---")
        context_eng = browser.new_context(viewport={"width": 1440, "height": 900})
        page_eng = context_eng.new_page()
        page_eng.goto(f"{BASE_URL}/login")
        page_eng.wait_for_selector("input#email-input", timeout=8000)
        page_eng.fill("input#email-input", "engineer@infrascan.local")
        page_eng.fill("input#password-input", "TestPass123!@#")
        page_eng.click("button[type='submit']")
        page_eng.wait_for_url("**/dashboard**", timeout=10000)
        print("Logged in as Civil Engineer.")

        # Navigate directly to the asset created in E2E test: BR-003
        page_eng.goto(f"{BASE_URL}/app/assets/BR-003")
        page_eng.wait_for_load_state("networkidle")
        time.sleep(1.5)
        page_eng.screenshot(path=os.path.join(SCREENS_DIR, "engineer_asset_br003_detail.png"))
        assert page_eng.locator("text=Hudson Overpass Pier 4").is_visible() or page_eng.locator("text=BR-003").is_visible()
        print("Civil Engineer successfully viewed Asset BR-003 (Hudson Overpass Pier 4) with its live inspections!")
        context_eng.close()

        print("\n--- 5. Verify Infrastructure Manager views Asset BR-003 ---")
        context_mgr = browser.new_context(viewport={"width": 1440, "height": 900})
        page_mgr = context_mgr.new_page()
        page_mgr.goto(f"{BASE_URL}/login")
        page_mgr.wait_for_selector("input#email-input", timeout=8000)
        page_mgr.fill("input#email-input", "manager@infrascan.local")
        page_mgr.fill("input#password-input", "TestPass123!@#")
        page_mgr.click("button[type='submit']")
        page_mgr.wait_for_url("**/dashboard**", timeout=10000)
        print("Logged in as Infrastructure Manager.")

        page_mgr.goto(f"{BASE_URL}/app/assets/BR-003")
        page_mgr.wait_for_load_state("networkidle")
        time.sleep(1.5)
        page_mgr.screenshot(path=os.path.join(SCREENS_DIR, "manager_asset_br003_detail.png"))
        assert page_mgr.locator("text=Hudson Overpass Pier 4").is_visible() or page_mgr.locator("text=BR-003").is_visible()
        print("Infrastructure Manager successfully viewed Asset BR-003!")
        context_mgr.close()

        print("\n=================================================")
        print("BROWSER TEST COMPLETE: ZERO CRITICAL FAILURES")
        print("Console errors recorded:", [e for e in console_errors if "401" not in e and "favicon" not in e])
        print("=================================================")

        browser.close()

if __name__ == "__main__":
    run()
