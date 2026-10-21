import uuid
import httpx
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.all_models import (
    User, UserCredential, AuthToken, RefreshSession, Invitation, Organization, SetupState
)
from app.security.password import hash_password, verify_password, validate_password_strength
from app.security.tokens import generate_random_token, hash_token
from app.security.jwt import create_access_token, get_current_user
from app.services.email import (
    send_verification_email,
    send_password_reset_email,
    send_account_locked_email,
)
from app.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "infrascan_refresh"

def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

# -----------------------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    fullName: str
    email: str
    password: str
    requestedRole: str
    organizationId: Optional[str] = None
    inviteCode: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    rememberDevice: Optional[bool] = False

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str

class AcceptInviteRequest(BaseModel):
    fullName: str
    password: str

class SetupRequest(BaseModel):
    setupToken: str
    fullName: str
    email: str
    password: str

class GoogleCallbackRequest(BaseModel):
    code: str
    redirectUri: str

# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.get("/providers")
def get_providers():
    """Rule 10: OAuth buttons appear only for configured providers."""
    return {
        "providers": settings.configured_oauth_providers,
        "googleClientId": settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
    }

@router.post("/google/callback")
async def google_callback(req: GoogleCallbackRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Exchange Google OAuth code for tokens and establish authenticated session."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "OAUTH_NOT_CONFIGURED", "message": "Google OAuth is not configured on the server."}
        )

    # 1. Exchange code with Google
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": req.redirectUri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            err_json = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else {}
            err_msg = err_json.get("error_description") or err_json.get("error") or "Failed to exchange code with Google"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "GOOGLE_AUTH_FAILED", "message": err_msg}
            )

        token_data = token_resp.json()
        google_access_token = token_data.get("access_token")

        # 2. Fetch user profile from Google
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"}
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "GOOGLE_USERINFO_FAILED", "message": "Failed to retrieve user information from Google."}
            )
        
        user_info = userinfo_resp.json()

    email = user_info.get("email", "").lower().strip()
    name = user_info.get("name") or email.split("@")[0]

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_REQUIRED", "message": "Google account does not provide an email address."}
        )

    now = datetime.now(timezone.utc)
    user = db.query(User).filter(User.email == email).first()

    # 3. Provision or update user
    if not user:
        # First user in database becomes admin, subsequent users become pending inspectors
        user_count = db.query(User).count()
        if user_count == 0:
            assigned_role = "admin"
            status_val = "active"
        else:
            assigned_role = "inspector"
            status_val = "pending_approval"

        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
            db.add(org)
            db.flush()

        user = User(
            name=name,
            email=email,
            role=assigned_role,
            requested_role=assigned_role,
            status=status_val,
            email_verified_at=now,
            sso_subject=user_info.get("sub"),
            organization_id=org.id,
        )
        db.add(user)
        db.commit()

        log_audit_event(
            db,
            actor_email=email,
            action="USER_CREATED_VIA_GOOGLE_OAUTH",
            entity_type="user",
            entity_id=user.id,
            details={"provider": "google", "role": assigned_role, "status": status_val}
        )

        if status_val == "pending_approval":
            return {
                "success": True,
                "status": "pending_approval",
                "message": "Account created via Google. Your access request is awaiting administrator approval."
            }
    else:
        if not user.email_verified_at:
            user.email_verified_at = now
        if not user.sso_subject:
            user.sso_subject = user_info.get("sub")
            db.commit()

        if user.status == "pending_approval":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_PENDING", "message": "This account is awaiting administrator approval."}
            )

        if user.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_INACTIVE", "message": f"This account is {user.status}. Please contact an administrator."}
            )

    user.last_login_at = now
    user.failed_login_attempts = 0
    user.locked_until = None

    # 4. Generate JWT access token & rotating refresh session
    access_token = create_access_token({"sub": user.id, "role": user.role, "email": user.email})
    raw_refresh = generate_random_token(48)
    family_id = str(uuid.uuid4())
    client_ip = request.client.host if request.client else None

    session_record = RefreshSession(
        user_id=user.id,
        family_id=family_id,
        token_hash=hash_token(raw_refresh),
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session_record)
    db.commit()

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    log_audit_event(
        db,
        actor_email=user.email,
        action="LOGIN_SUCCESS_GOOGLE",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip
    )

    org_name = user.organization.name if user.organization else "InfraScan Authority"
    return {
        "accessToken": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organizationName": org_name,
            "organizationId": user.organization_id,
            "status": user.status,
        }
    }

@router.get("/setup/status")
def get_setup_status(db: Session = Depends(get_db)):
    """Check if first-time administrator setup is available (Section S.5)."""
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    return {"setupRequired": not admin_exists}

@router.get("/me")
def get_auth_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "organizationName": user.organization.name if user.organization else "Unassigned",
        "organizationId": user.organization_id,
        "status": user.status,
        "emailVerified": user.email_verified_at is not None,
    }

@router.post("/setup")
def setup_first_admin(req: SetupRequest, db: Session = Depends(get_db)):
    """Create the first administrator using the one-time setup token (Section S.5)."""
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    if admin_exists:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "SETUP_COMPLETED", "message": "Initial setup has already been completed."}
        )
    
    if req.setupToken.strip() != settings.SETUP_TOKEN.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_SETUP_TOKEN", "message": "The setup token provided is invalid."}
        )
    
    valid_pass, err_msg = validate_password_strength(req.password, req.fullName, req.email)
    if not valid_pass:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": err_msg}
        )
    
    # Ensure root organization
    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
        db.add(org)
        db.flush()
    
    admin_user = User(
        name=req.fullName,
        email=req.email.lower().strip(),
        role="admin",
        status="active",
        email_verified_at=datetime.now(timezone.utc),
        organization_id=org.id,
    )
    db.add(admin_user)
    db.flush()

    cred = UserCredential(
        user_id=admin_user.id,
        password_hash=hash_password(req.password)
    )
    db.add(cred)
    db.commit()

    log_audit_event(
        db,
        actor_email=admin_user.email,
        action="SETUP_FIRST_ADMIN_COMPLETED",
        entity_type="user",
        entity_id=admin_user.id,
        details={"email": admin_user.email, "role": "admin"}
    )

    return {"success": True, "message": "Administrator account initialized. You may now log in."}

@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
async def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Registration creates pending_approval user with requested role. No Administrator allowed."""
    client_ip = request.client.host if request.client else None
    
    # Check if Administrator was attempted
    if req.requestedRole.lower() == "admin" or req.requestedRole.lower() == "administrator":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_ROLE", "message": "Administrator role cannot be self-requested."}
        )
    
    email_clean = req.email.lower().strip()
    
    # Validate password rules (12 to 128 characters, Argon2id)
    valid_pass, err_msg = validate_password_strength(req.password, req.fullName, email_clean)
    if not valid_pass:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": err_msg}
        )
    
    # Check if user already exists (No Account Enumeration: return 202 identical response)
    existing_user = db.query(User).filter(User.email == email_clean).first()
    if existing_user:
        # Silently do not re-create, return identical 202
        return {"success": True, "message": "Check your e-mail to verify your address. An administrator will then review your access request."}
    
    # Resolve organization
    org_id = req.organizationId
    if org_id:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            default_org = db.query(Organization).first()
            org_id = default_org.id if default_org else None
    else:
        default_org = db.query(Organization).first()
        org_id = default_org.id if default_org else None
    
    new_user = User(
        name=req.fullName,
        email=email_clean,
        role=req.requestedRole.lower(),
        requested_role=req.requestedRole.lower(),
        status="pending_approval",
        organization_id=org_id,
    )
    db.add(new_user)
    db.flush()

    cred = UserCredential(
        user_id=new_user.id,
        password_hash=hash_password(req.password)
    )
    db.add(cred)

    # Create verification token (24 hours expiry)
    raw_token = generate_random_token(32)
    verify_token = AuthToken(
        user_id=new_user.id,
        token_type="verify",
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verify_token)
    db.commit()

    log_audit_event(
        db,
        actor_email=email_clean,
        action="USER_REGISTERED",
        entity_type="user",
        entity_id=new_user.id,
        details={"requested_role": req.requestedRole},
        ip_address=client_ip
    )

    # Send real email via SMTP
    await send_verification_email(email_clean, raw_token)

    return {"success": True, "message": "Check your e-mail to verify your address. An administrator will then review your access request."}

@router.post("/verify-email")
def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verifies token from the email link."""
    hashed = hash_token(req.token)
    token_record = db.query(AuthToken).filter(
        AuthToken.token_hash == hashed,
        AuthToken.token_type == "verify"
    ).first()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TOKEN", "message": "Verification token is invalid."}
        )
    
    if token_record.used_at is not None:
        return {"success": True, "status": "verified", "message": "Email is already verified."}

    if to_utc(token_record.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TOKEN_EXPIRED", "message": "Verification link has expired."}
        )

    token_record.used_at = datetime.now(timezone.utc)
    user = db.query(User).filter(User.id == token_record.user_id).first()
    if user:
        user.email_verified_at = datetime.now(timezone.utc)
        log_audit_event(
            db,
            actor_email=user.email,
            action="EMAIL_VERIFIED",
            entity_type="user",
            entity_id=user.id,
        )

    db.commit()
    return {"success": True, "status": "verified", "message": "Email verified successfully. Awaiting administrator approval."}

@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(req: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Resend email verification token (generic response)."""
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if user and not user.email_verified_at:
        raw_token = generate_random_token(32)
        verify_token = AuthToken(
            user_id=user.id,
            token_type="verify",
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        db.add(verify_token)
        db.commit()
        await send_verification_email(user.email, raw_token)

    return {"success": True, "message": "If an unverified account exists, a new link has been sent."}

@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Real database authentication, 5-attempt lockout, JWT in-memory + HttpOnly refresh cookie."""
    client_ip = request.client.host if request.client else None
    email_clean = req.email.lower().strip()

    user = db.query(User).filter(User.email == email_clean).first()
    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first() if user else None

    # Enforce lockout
    now = datetime.now(timezone.utc)
    if user and user.locked_until and to_utc(user.locked_until) > now:
        log_audit_event(
            db,
            actor_email=email_clean,
            action="LOGIN_REJECTED_LOCKED",
            ip_address=client_ip
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"code": "ACCOUNT_LOCKED", "message": "Too many failed attempts. Try again in 15 minutes, or reset your password."}
        )

    # Check password
    is_valid = False
    if cred and cred.password_hash:
        is_valid = verify_password(req.password, cred.password_hash)

    if not is_valid:
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 5:
                user.locked_until = now + timedelta(minutes=15)
                log_audit_event(
                    db,
                    actor_email=email_clean,
                    action="ACCOUNT_LOCKED_FAILED_ATTEMPTS",
                    entity_type="user",
                    entity_id=user.id,
                    ip_address=client_ip
                )
            db.commit()

        log_audit_event(
            db,
            actor_email=email_clean,
            action="LOGIN_FAILED",
            ip_address=client_ip
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "E-mail or password is incorrect."}
        )

    # Account status gates
    if not user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Please verify your e-mail address before signing in."}
        )

    if user.status == "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_PENDING", "message": "This account is awaiting administrator approval."}
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_INACTIVE", "message": f"This account is {user.status}. Contact your administrator."}
        )

    # Successful login: reset failed counter
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now

    # Issue access token
    access_token = create_access_token({"sub": user.id, "role": user.role, "email": user.email})

    # Issue refresh session family
    raw_refresh = generate_random_token(48)
    family_id = str(uuid.uuid4())
    session_record = RefreshSession(
        user_id=user.id,
        family_id=family_id,
        token_hash=hash_token(raw_refresh),
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session_record)
    db.commit()

    # Set HttpOnly, SameSite, Secure cookie
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    log_audit_event(
        db,
        actor_email=user.email,
        action="LOGIN_SUCCESS",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip
    )

    org_name = user.organization.name if user.organization else "InfraScan Authority"
    return {
        "accessToken": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organizationName": org_name,
            "organizationId": user.organization_id,
            "status": user.status,
        }
    }

@router.post("/refresh")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """Rotating refresh token with session-family reuse detection (Section 2.5)."""
    raw_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_REFRESH_TOKEN", "message": "No refresh session token present."}
        )

    token_h = hash_token(raw_cookie)
    sess = db.query(RefreshSession).filter(RefreshSession.token_hash == token_h).first()
    now = datetime.now(timezone.utc)

    if not sess:
        response.delete_cookie(REFRESH_COOKIE_NAME)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": "Invalid session token."}
        )

    # REUSE DETECTION: If this token was already revoked, someone is replaying it!
    # Security Rule: Immediately revoke the ENTIRE session family!
    if sess.revoked_at is not None:
        db.query(RefreshSession).filter(RefreshSession.family_id == sess.family_id).update(
            {"revoked_at": now}
        )
        db.commit()
        response.delete_cookie(REFRESH_COOKIE_NAME)
        log_audit_event(
            db,
            actor_email=f"user_id:{sess.user_id}",
            action="SECURITY_REFRESH_TOKEN_REUSE_DETECTED",
            entity_type="refresh_family",
            entity_id=sess.family_id,
            details={"revoked_all_in_family": True}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_REUSE_DETECTED", "message": "Suspicious activity detected. All sessions revoked."}
        )

    if to_utc(sess.expires_at) < now:
        sess.revoked_at = now
        db.commit()
        response.delete_cookie(REFRESH_COOKIE_NAME)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Session has expired. Please log in again."}
        )

    # Valid: Rotate token in same family
    sess.revoked_at = now
    new_raw_refresh = generate_random_token(48)
    new_sess = RefreshSession(
        user_id=sess.user_id,
        family_id=sess.family_id,
        token_hash=hash_token(new_raw_refresh),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_sess)

    user = db.query(User).filter(User.id == sess.user_id).first()
    if not user or user.status != "active":
        db.commit()
        response.delete_cookie(REFRESH_COOKIE_NAME)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "USER_INACTIVE"})

    access_token = create_access_token({"sub": user.id, "role": user.role, "email": user.email})
    db.commit()

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=new_raw_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    return {"accessToken": access_token}

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revokes session family and clears cookie."""
    raw_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_cookie:
        token_h = hash_token(raw_cookie)
        sess = db.query(RefreshSession).filter(RefreshSession.token_hash == token_h).first()
        if sess:
            sess.revoked_at = datetime.now(timezone.utc)
            db.commit()
            log_audit_event(
                db,
                actor_email=f"user_id:{sess.user_id}",
                action="USER_LOGOUT",
                entity_type="session",
                entity_id=sess.id
            )

    res = Response(status_code=status.HTTP_204_NO_CONTENT)
    res.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    return res

@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Always returns 202 to prevent user enumeration."""
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if user and user.status == "active":
        raw_token = generate_random_token(32)
        reset_token = AuthToken(
            user_id=user.id,
            token_type="reset",
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=60),
        )
        db.add(reset_token)
        db.commit()

        log_audit_event(
            db,
            actor_email=user.email,
            action="PASSWORD_RESET_REQUESTED",
            entity_type="user",
            entity_id=user.id
        )

        await send_password_reset_email(user.email, raw_token)

    return {"success": True, "message": "If an account exists for that address, a reset link has been sent."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Resets password, invalidates all sessions for user."""
    hashed = hash_token(req.token)
    token_record = db.query(AuthToken).filter(
        AuthToken.token_hash == hashed,
        AuthToken.token_type == "reset"
    ).first()

    if not token_record or token_record.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TOKEN", "message": "Password reset link is invalid or already used."}
        )

    now = datetime.now(timezone.utc)
    if to_utc(token_record.expires_at) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TOKEN_EXPIRED", "message": "Password reset link has expired."}
        )

    user = db.query(User).filter(User.id == token_record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN"})

    valid_pass, err_msg = validate_password_strength(req.newPassword, user.name, user.email)
    if not valid_pass:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": err_msg}
        )

    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if not cred:
        cred = UserCredential(user_id=user.id, password_hash=hash_password(req.newPassword))
        db.add(cred)
    else:
        cred.password_hash = hash_password(req.newPassword)

    token_record.used_at = now
    
    # Invalidate all active refresh sessions of this user
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None)
    ).update({"revoked_at": now})

    db.commit()

    log_audit_event(
        db,
        actor_email=user.email,
        action="PASSWORD_RESET_COMPLETED",
        entity_type="user",
        entity_id=user.id
    )

    return {"success": True, "message": "Your password has been changed. Please log in with your new credentials."}

@router.get("/invitations/{token}")
def get_invitation_details(token: str, db: Session = Depends(get_db)):
    """Retrieve invitation details by token (Section 2.4, Check C11)."""
    hashed = hash_token(token)
    invitation = db.query(Invitation).filter(Invitation.token_hash == hashed).first()
    if not invitation:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INVITATION", "message": "This invitation link is invalid."})

    now = datetime.now(timezone.utc)
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=400, detail={"code": "INVITATION_ALREADY_USED", "message": "This invitation has already been used."})

    if to_utc(invitation.expires_at) < now:
        raise HTTPException(status_code=400, detail={"code": "INVITATION_EXPIRED", "message": "This invitation has expired. Contact your administrator."})

    org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()
    org_name = org.name if org else "Primary Infrastructure Authority"
    return {
        "email": invitation.email,
        "role": invitation.role,
        "organizationName": org_name,
        "organizationId": invitation.organization_id,
    }

class AcceptInvitationPayload(BaseModel):
    fullName: str
    password: str

@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, req: AcceptInvitationPayload, db: Session = Depends(get_db)):
    """Accept invitation: create active user without approval (Section 2.4, Check C11)."""
    hashed = hash_token(token)
    invitation = db.query(Invitation).filter(Invitation.token_hash == hashed).first()
    if not invitation:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INVITATION", "message": "This invitation link is invalid."})

    now = datetime.now(timezone.utc)
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=400, detail={"code": "INVITATION_ALREADY_USED", "message": "This invitation has already been used."})

    if to_utc(invitation.expires_at) < now:
        raise HTTPException(status_code=400, detail={"code": "INVITATION_EXPIRED", "message": "This invitation has expired. Contact your administrator."})

    valid_pass, err_msg = validate_password_strength(req.password, req.fullName, invitation.email)
    if not valid_pass:
        raise HTTPException(status_code=400, detail={"code": "WEAK_PASSWORD", "message": err_msg})

    existing = db.query(User).filter(User.email == invitation.email.lower()).first()
    if existing:
        user = existing
        user.status = "active"
        user.role = invitation.role
        user.email_verified_at = now
        cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
        if cred:
            cred.password_hash = hash_password(req.password)
        else:
            db.add(UserCredential(user_id=user.id, password_hash=hash_password(req.password)))
    else:
        user = User(
            name=req.fullName,
            email=invitation.email.lower(),
            role=invitation.role,
            status="active",
            email_verified_at=now,
            organization_id=invitation.organization_id,
        )
        db.add(user)
        db.flush()
        db.add(UserCredential(user_id=user.id, password_hash=hash_password(req.password)))

    invitation.accepted_at = now
    db.commit()

    log_audit_event(
        db,
        actor_email=user.email,
        action="INVITATION_ACCEPTED",
        entity_type="user",
        entity_id=user.id,
        details={"role": user.role}
    )

    return {"success": True, "message": "Invitation accepted. You may now log in with your credentials."}
