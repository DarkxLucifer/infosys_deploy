import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.all_models import User, Organization, UserCredential
from app.security.password import hash_password

def test_reported_bugs_regression():
    client = TestClient(app)

    # 1. Ensure admin exists
    db = SessionLocal()
    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin = db.query(User).filter(User.role == "admin").first()
    if not admin:
        admin = User(
            name="Platform Admin",
            email="admin.test@infrascan.local",
            role="admin",
            status="active",
            organization_id=org.id,
        )
        db.add(admin)
        db.flush()
        cred = UserCredential(user_id=admin.id, password_hash=hash_password("AdminPass123!@#"))
        db.add(cred)
        db.commit()

    admin_email = admin.email
    org_id = org.id
    db.close()

    # 2. Login as admin
    admin_login_res = client.post("/api/v1/auth/login", json={
        "email": admin_email,
        "password": "AdminPass123!@#",
    })
    # If admin password differed, just use a clean admin token
    if admin_login_res.status_code != 200:
        db = SessionLocal()
        admin_user = db.query(User).filter(User.role == "admin").first()
        admin_user_email = admin_user.email
        cred = db.query(UserCredential).filter(UserCredential.user_id == admin_user.id).first()
        cred.password_hash = hash_password("AdminPass123!@#")
        admin_user.status = "active"
        admin_user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
        db.close()
        admin_login_res = client.post("/api/v1/auth/login", json={
            "email": admin_user_email,
            "password": "AdminPass123!@#",
        })

    assert admin_login_res.status_code == 200
    admin_token = admin_login_res.json()["accessToken"]
    assert "infrascan_refresh" in admin_login_res.cookies

    # 3. Register a brand new user
    new_email = f"field_inspector_{id(admin)}@demo.test"
    reg_res = client.post("/api/v1/auth/register", json={
        "fullName": "Field Specialist Alex",
        "email": new_email,
        "password": "ValidPassword123!",
        "requestedRole": "inspector",
        "organizationId": org_id,
    })
    assert reg_res.status_code == 202

    # 4. BUG 3 CHECK: Verify the new user appears in Admin Pending Approvals
    pending_res = client.get(
        "/api/v1/admin/pending-users",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    new_user_entry = next((u for u in pending_list if u["email"] == new_email), None)
    assert new_user_entry is not None, f"Registered user {new_email} must appear in admin pending approvals!"
    assert new_user_entry["name"] == "Field Specialist Alex"
    assert new_user_entry["requestedRole"] == "inspector"

    # 5. Approve the user via admin endpoint
    approve_res = client.post(
        f"/api/v1/admin/users/{new_user_entry['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "inspector"}
    )
    assert approve_res.status_code == 200

    # 6. Verify user can now log in
    user_login_res = client.post("/api/v1/auth/login", json={
        "email": new_email,
        "password": "ValidPassword123!",
    })
    assert user_login_res.status_code == 200
    user_data = user_login_res.json()
    assert user_data["user"]["role"] == "inspector"
    user_client = TestClient(app, cookies=user_login_res.cookies)

    # 7. BUG 1 CHECK: Auto-login / refresh session works via cookies
    refresh_res = user_client.post("/api/v1/auth/refresh")
    assert refresh_res.status_code == 200
    refreshed_token = refresh_res.json()["accessToken"]
    assert refreshed_token is not None

    # 8. BUG 2 & 1 CHECK: Logout clears cookie and invalidates session
    logout_res = user_client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 204
    # Check that Set-Cookie header explicitly clears infrascan_refresh
    set_cookie_header = logout_res.headers.get("set-cookie", "")
    assert "infrascan_refresh=" in set_cookie_header
    assert ("max-age=0" in set_cookie_header.lower() or "expires=" in set_cookie_header.lower())

    # 9. Verify that after logout, refreshing fails (cookies cleared / invalidated)
    post_logout_refresh = user_client.post("/api/v1/auth/refresh", cookies=logout_res.cookies)
    assert post_logout_refresh.status_code in [401, 403]
