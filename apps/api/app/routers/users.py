from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import User, UserCredential, RefreshSession
from app.security.jwt import get_current_user
from app.security.password import hash_password, verify_password, validate_password_strength
from app.security.tokens import hash_token
from app.services.audit import log_audit_event

router = APIRouter(prefix="/me", tags=["User Profile & Sessions"])

def to_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str

@router.get("")
def get_profile(user: User = Depends(get_current_user)):
    """User profile management (/app/profile, Section 2.4)."""
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "organizationName": user.organization.name if user.organization else "Unassigned",
        "organizationId": user.organization_id,
        "status": user.status,
        "emailVerified": user.email_verified_at is not None,
        "createdAt": to_utc_iso(user.created_at),
    }

@router.patch("")
def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    updated = False
    details = {}
    if req.name and req.name.strip():
        user.name = req.name.strip()
        updated = True
        details["updated_name"] = user.name
    if req.role and req.role.strip():
        valid_roles = {"inspector", "engineer", "civil-engineer", "civil_engineer", "maintenance", "manager", "admin"}
        norm_role = req.role.strip().lower()
        if norm_role in valid_roles:
            user.role = norm_role
            updated = True
            details["updated_role"] = user.role
    if updated:
        db.commit()
        log_audit_event(
            db,
            actor_email=user.email,
            action="USER_UPDATED_PROFILE",
            entity_type="user",
            entity_id=user.id,
            details=details,
            user_id=user.id
        )
    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organizationName": user.organization.name if user.organization else "Unassigned",
            "organizationId": user.organization_id,
        }
    }

@router.post("/password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if not cred or not verify_password(req.currentPassword, cred.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PASSWORD", "message": "Current password is incorrect."}
        )
    
    valid_pass, err_msg = validate_password_strength(req.newPassword, user.name, user.email)
    if not valid_pass:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": err_msg}
        )
    
    cred.password_hash = hash_password(req.newPassword)
    db.commit()

    log_audit_event(
        db,
        actor_email=user.email,
        action="USER_CHANGED_PASSWORD",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id
    )

    return {"success": True, "message": "Password updated successfully."}

@router.get("/sessions")
def get_active_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    sessions = db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
        RefreshSession.expires_at > now
    ).order_by(RefreshSession.last_used_at.desc()).all()

    return [
        {
            "id": s.id,
            "ipAddress": s.ip_address or "Unknown IP",
            "userAgent": s.user_agent or "Unknown Client",
            "createdAt": to_utc_iso(s.created_at),
            "lastUsedAt": to_utc_iso(s.last_used_at),
            "expiresAt": to_utc_iso(s.expires_at),
        }
        for s in sessions
    ]

@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    sess = db.query(RefreshSession).filter(
        RefreshSession.id == session_id,
        RefreshSession.user_id == user.id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND"})

    sess.revoked_at = datetime.now(timezone.utc)
    db.commit()

    log_audit_event(
        db,
        actor_email=user.email,
        action="USER_REVOKED_SESSION",
        entity_type="session",
        entity_id=session_id,
        user_id=user.id
    )

    return {"success": True, "message": "Session revoked."}

@router.post("/sessions/revoke-others")
def revoke_other_sessions(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Revoke all sessions for this user except the current session (Check D9)."""
    now = datetime.now(timezone.utc)
    raw_cookie = request.cookies.get("infrascan_refresh")
    current_token_hash = hash_token(raw_cookie) if raw_cookie else None

    query = db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None)
    )
    if current_token_hash:
        query = query.filter(RefreshSession.token_hash != current_token_hash)

    revoked_count = query.update({"revoked_at": now}, synchronize_session=False)
    db.commit()

    log_audit_event(
        db,
        actor_email=user.email,
        action="USER_REVOKED_OTHER_SESSIONS",
        entity_type="user",
        entity_id=user.id,
        details={"revoked_count": revoked_count},
        user_id=user.id
    )

    return {"success": True, "message": f"{revoked_count} other session(s) revoked."}
