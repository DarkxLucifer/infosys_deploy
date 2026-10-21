from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from app.database import SessionLocal
from app.models.all_models import User

# 1. Ensure all users have email_verified_at set
db = SessionLocal()
now = datetime.now(timezone.utc)
users = db.query(User).all()
for u in users:
    u.email_verified_at = now
    u.status = "active"
db.commit()
db.close()
print("All users email_verified_at updated.")

def test_role_dashboards():
    roles = [
        ("admin", "admin@infrascan.local"),
        ("inspector", "inspector@infrascan.local"),
        ("engineer", "engineer@infrascan.local"),
        ("manager", "manager@infrascan.local"),
        ("maintenance", "maintenance@infrascan.local"),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for role, email in roles:
            context = browser.new_context()
            page = context.new_page()
            errors = []
            page.on("console", lambda m: errors.append((m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(("EXCEPTION", str(e))))

            page.goto("http://localhost:5173/login")
            page.wait_for_selector("input#email-input")
            page.fill("input#email-input", email)
            page.fill("input#password-input", "TestPass123!@#")
            page.locator('button:has-text("Log in")').click()
            page.wait_for_timeout(2500)

            print(f"\n==================== ROLE: {role} ({email}) ====================")
            print("URL:", page.url)
            print("EXCEPTIONS/ERRORS:", errors)
            body_text = page.locator("body").inner_text()
            print("BODY TEXT (first 300 chars):", repr(body_text[:300]))
            if not body_text.strip():
                print(">>> WHITE SCREEN DETECTED FOR ROLE:", role)
            else:
                print(">>> Page has content. No white screen.")
            context.close()
        browser.close()

if __name__ == "__main__":
    test_role_dashboards()
