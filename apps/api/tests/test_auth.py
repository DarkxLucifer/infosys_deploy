import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app as fastapi_app
from app.database import Base, get_db
import app.database
import app.middleware
from app.config import settings

# In-memory SQLite for fast, isolated test suite with StaticPool
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="function")
def db_session(monkeypatch):
    Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(app.database, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(app.middleware, "SessionLocal", TestingSessionLocal)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()

def test_setup_first_admin(client):
    # 1. Setup status says required
    status_res = client.get("/api/v1/auth/setup/status")
    assert status_res.status_code == 200
    assert status_res.json()["setupRequired"] is True

    # 2. Complete setup with setup token
    res = client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Alice Admin",
        "email": "admin@infrascan.local",
        "password": "SecurePassword123!"
    })
    assert res.status_code == 200
    assert res.json()["success"] is True

    # 3. Setup status now False
    status_res2 = client.get("/api/v1/auth/setup/status")
    assert status_res2.json()["setupRequired"] is False

    # 4. Second setup attempt blocked
    blocked = client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Attacker",
        "email": "attacker@infrascan.local",
        "password": "SecurePassword123!"
    })
    assert blocked.status_code == 403

def test_registration_and_approval_flow(client):
    # Setup admin first
    client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Admin User",
        "email": "admin@infrascan.local",
        "password": "AdminPassword123!"
    })

    # Cannot self-request Administrator
    bad_reg = client.post("/api/v1/auth/register", json={
        "fullName": "Sneaky User",
        "email": "sneaky@infrascan.local",
        "password": "ValidPassword123!",
        "requestedRole": "admin"
    })
    assert bad_reg.status_code == 400

    # Weak password (<12 chars) rejected
    weak_reg = client.post("/api/v1/auth/register", json={
        "fullName": "John Inspector",
        "email": "inspector@infrascan.local",
        "password": "short",
        "requestedRole": "inspector"
    })
    assert weak_reg.status_code == 400

    # Valid registration
    reg = client.post("/api/v1/auth/register", json={
        "fullName": "John Inspector",
        "email": "inspector@infrascan.local",
        "password": "StrongPassword123!",
        "requestedRole": "inspector"
    })
    assert reg.status_code == 202

    # Cannot login yet (email not verified)
    login_unverified = client.post("/api/v1/auth/login", json={
        "email": "inspector@infrascan.local",
        "password": "StrongPassword123!"
    })
    assert login_unverified.status_code == 403
    assert login_unverified.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED"

def test_login_generic_error_and_lockout(client):
    # Setup user directly via setup
    setup_res = client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Target User",
        "email": "target@infrascan.local",
        "password": "SecureLockout987!"
    })
    assert setup_res.status_code == 200

    # Non-existent email
    res1 = client.post("/api/v1/auth/login", json={
        "email": "unknown@infrascan.local",
        "password": "WrongPassword123!"
    })
    # Existing email with wrong password
    res2 = client.post("/api/v1/auth/login", json={
        "email": "target@infrascan.local",
        "password": "WrongPassword123!"
    })

    # Both must give identical message
    assert res1.status_code == 401
    assert res2.status_code == 401
    assert res1.json()["detail"]["message"] == res2.json()["detail"]["message"]

    # 4 more failed attempts trigger lockout (total 5)
    for _ in range(4):
        client.post("/api/v1/auth/login", json={
            "email": "target@infrascan.local",
            "password": "WrongPassword123!"
        })

    locked_res = client.post("/api/v1/auth/login", json={
        "email": "target@infrascan.local",
        "password": "SecureLockout987!"
    })
    assert locked_res.status_code == 423
    assert locked_res.json()["detail"]["code"] == "ACCOUNT_LOCKED"

def test_role_authorization_enforced(client):
    # Admin
    setup_res = client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Root Admin",
        "email": "rootadmin@infrascan.local",
        "password": "SuperSecretKey987!"
    })
    assert setup_res.status_code == 200

    admin_login = client.post("/api/v1/auth/login", json={
        "email": "rootadmin@infrascan.local",
        "password": "SuperSecretKey987!"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["accessToken"]

    # Admin can access admin endpoints
    admin_view = client.get("/api/v1/admin/pending-users", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_view.status_code == 200

    # Register inspector
    reg_res = client.post("/api/v1/auth/register", json={
        "fullName": "Jane Inspector",
        "email": "jane@infrascan.local",
        "password": "SuperSecretKey987!",
        "requestedRole": "inspector"
    })
    assert reg_res.status_code == 202

    pending_list = client.get("/api/v1/admin/pending-users", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert len(pending_list) >= 1
    target_id = pending_list[0]["id"]

    approve_res = client.post(f"/api/v1/admin/users/{target_id}/approve", json={"role": "inspector"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert approve_res.status_code == 200

    # Inspector logs in
    insp_login = client.post("/api/v1/auth/login", json={
        "email": "jane@infrascan.local",
        "password": "SuperSecretKey987!"
    })
    assert insp_login.status_code == 200
    insp_token = insp_login.json()["accessToken"]

    # Inspector cannot access admin endpoints -> 403 Forbidden!
    forbidden = client.get("/api/v1/admin/pending-users", headers={"Authorization": f"Bearer {insp_token}"})
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["code"] == "ACCESS_DENIED"

def test_invitation_lifecycle(client, db_session):
    # Setup admin
    setup_res = client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Evelyn Vance",
        "email": "evelyn@infrascan.local",
        "password": "CobaltHorizon987#"
    })
    assert setup_res.status_code == 200
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "evelyn@infrascan.local",
        "password": "CobaltHorizon987#"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["accessToken"]

    # 1. Admin creates invitation
    invite_res = client.post("/api/v1/admin/invitations", json={
        "email": "invited.engineer@infrascan.local",
        "role": "engineer"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert invite_res.status_code == 200

    # Retrieve invitation raw token from DB
    from app.models.all_models import Invitation
    from app.security.tokens import hash_token
    inv = db_session.query(Invitation).filter(Invitation.email == "invited.engineer@infrascan.local").first()
    assert inv is not None

    # We test via an active token hash matching
    # Let's create an explicit invitation token for deterministic test
    from app.security.tokens import generate_random_token
    test_raw_token = generate_random_token(32)
    inv.token_hash = hash_token(test_raw_token)
    db_session.commit()

    # 2. View invitation details
    details_res = client.get(f"/api/v1/auth/invitations/{test_raw_token}")
    assert details_res.status_code == 200
    assert details_res.json()["email"] == "invited.engineer@infrascan.local"
    assert details_res.json()["role"] == "engineer"

    # 3. Accept invitation
    accept_res = client.post(f"/api/v1/auth/invitations/{test_raw_token}/accept", json={
        "fullName": "Invited Engineer",
        "password": "EngineerPass123!"
    })
    assert accept_res.status_code == 200

    # 4. Invited user can log in immediately without admin approval
    login_res = client.post("/api/v1/auth/login", json={
        "email": "invited.engineer@infrascan.local",
        "password": "EngineerPass123!"
    })
    assert login_res.status_code == 200
    assert login_res.json()["user"]["role"] == "engineer"
    assert login_res.json()["user"]["status"] == "active"

    # 5. Re-accepting fails
    reaccept_res = client.post(f"/api/v1/auth/invitations/{test_raw_token}/accept", json={
        "fullName": "Invited Engineer",
        "password": "EngineerPass123!"
    })
    assert reaccept_res.status_code == 400
    assert reaccept_res.json()["detail"]["code"] == "INVITATION_ALREADY_USED"

def test_refresh_rotation_and_family_reuse_detection(client):
    # Setup admin
    client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Session User",
        "email": "session@infrascan.local",
        "password": "SecurePassword123!"
    })
    login_res = client.post("/api/v1/auth/login", json={
        "email": "session@infrascan.local",
        "password": "SecurePassword123!"
    })
    assert login_res.status_code == 200
    first_cookie = login_res.cookies.get("infrascan_refresh")
    assert first_cookie is not None

    # Rotate refresh token
    client.cookies.set("infrascan_refresh", first_cookie)
    rotate_res = client.post("/api/v1/auth/refresh")
    assert rotate_res.status_code == 200
    new_token = rotate_res.json()["accessToken"]
    second_cookie = rotate_res.cookies.get("infrascan_refresh")
    assert second_cookie is not None
    assert second_cookie != first_cookie

    # Replay FIRST cookie (token reuse attack detection!)
    client.cookies.set("infrascan_refresh", first_cookie)
    replay_res = client.post("/api/v1/auth/refresh")
    assert replay_res.status_code == 401
    assert replay_res.json()["detail"]["code"] == "TOKEN_REUSE_DETECTED"

    # Whole family is now revoked: second cookie also fails!
    client.cookies.set("infrascan_refresh", second_cookie)
    second_failed = client.post("/api/v1/auth/refresh")
    assert second_failed.status_code == 401

def test_logout_and_session_invalidation(client):
    client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Logout Tester",
        "email": "logout@infrascan.local",
        "password": "SecurePassword123!"
    })
    login_res = client.post("/api/v1/auth/login", json={
        "email": "logout@infrascan.local",
        "password": "SecurePassword123!"
    })
    cookie = login_res.cookies.get("infrascan_refresh")
    token = login_res.json()["accessToken"]

    # Check sessions
    sessions_res = client.get("/api/v1/me/sessions", headers={"Authorization": f"Bearer {token}"})
    assert sessions_res.status_code == 200
    assert len(sessions_res.json()) >= 1

    # Logout
    client.cookies.set("infrascan_refresh", cookie)
    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 204

    # Refresh with revoked cookie returns 401
    client.cookies.set("infrascan_refresh", cookie)
    refresh_after_logout = client.post("/api/v1/auth/refresh")
    assert refresh_after_logout.status_code == 401

def test_password_reset_flow(client, db_session):
    client.post("/api/v1/auth/setup", json={
        "setupToken": settings.SETUP_TOKEN,
        "fullName": "Reset Tester",
        "email": "reset@infrascan.local",
        "password": "OldPassword123!"
    })

    # Forgot password request
    forgot_res = client.post("/api/v1/auth/forgot-password", json={"email": "reset@infrascan.local"})
    assert forgot_res.status_code == 202

    from app.models.all_models import AuthToken, User
    from app.security.tokens import generate_random_token, hash_token
    user = db_session.query(User).filter(User.email == "reset@infrascan.local").first()
    raw_reset_token = generate_random_token(32)
    db_token = AuthToken(
        user_id=user.id,
        token_type="reset",
        token_hash=hash_token(raw_reset_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    db_session.add(db_token)
    db_session.commit()

    # Reset password with new password
    reset_res = client.post("/api/v1/auth/reset-password", json={
        "token": raw_reset_token,
        "newPassword": "NewBrandPassword123!"
    })
    assert reset_res.status_code == 200

    # Old password fails
    old_fail = client.post("/api/v1/auth/login", json={
        "email": "reset@infrascan.local",
        "password": "OldPassword123!"
    })
    assert old_fail.status_code == 401

    # New password succeeds
    new_ok = client.post("/api/v1/auth/login", json={
        "email": "reset@infrascan.local",
        "password": "NewBrandPassword123!"
    })
    assert new_ok.status_code == 200

    # Token cannot be reused
    reused = client.post("/api/v1/auth/reset-password", json={
        "token": raw_reset_token,
        "newPassword": "AnotherPassword123!"
    })
    assert reused.status_code == 400
    assert reused.json()["detail"]["code"] == "INVALID_TOKEN"
