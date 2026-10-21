from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import User, Organization, Invitation, AuditLog, RequestMetric, RefreshSession
from app.security.jwt import require_role
from app.security.tokens import generate_random_token, hash_token
from app.services.email import (
    send_account_approved_email,
    send_account_rejected_email,
    send_invitation_email
)
from app.services.audit import log_audit_event

router = APIRouter(prefix="/admin", tags=["Administrator Management"])
admin_guard = require_role(["admin"])

class ApproveUserRequest(BaseModel):
    role: Optional[str] = None

class RejectUserRequest(BaseModel):
    reason: Optional[str] = "Application criteria not met."

class InviteUserRequest(BaseModel):
    email: str
    role: str
    organizationId: Optional[str] = None

@router.get("/pending-users")
def get_pending_users(
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """List users awaiting administrator approval (§5.1, wireframe screen 12, Check C6)."""
    query = db.query(User).filter(User.status == "pending_approval")
    if admin.organization_id:
        query = query.filter((User.organization_id == admin.organization_id) | (User.organization_id.is_(None)))
    users = query.order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "requestedRole": u.requested_role or u.role,
            "organizationName": u.organization.name if u.organization else "Unassigned",
            "emailVerified": u.email_verified_at is not None,
            "createdAt": u.created_at.isoformat() if u.created_at else "",
            "signupMethod": "google" if u.sso_subject else "password",
        }
        for u in users
    ]

@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    req: ApproveUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Approve a pending user, set role, send real email, write audit record (Check C7 idempotent)."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Idempotent: already active
    if target.status == "active":
        return {"success": True, "message": f"User {target.email} is already active.", "alreadyProcessed": True}

    final_role = req.role if req.role else (target.requested_role or target.role)
    target.status = "active"
    target.role = final_role.lower()
    
    # If not yet verified, mark verified upon admin approval
    if not target.email_verified_at:
        target.email_verified_at = datetime.now(timezone.utc)

    db.commit()

    log_audit_event(
        db,
        actor_email=admin.email,
        action="ADMIN_APPROVED_USER",
        entity_type="user",
        entity_id=target.id,
        details={"approved_role": final_role, "applicant_email": target.email},
        user_id=admin.id
    )

    await send_account_approved_email(target.email, final_role)

    return {"success": True, "message": f"User {target.email} approved as {final_role}."}

@router.post("/users/{user_id}/reject")
async def reject_user(
    user_id: str,
    req: RejectUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Reject a pending access request, write audit log, send email."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    target.status = "deactivated"
    db.commit()

    log_audit_event(
        db,
        actor_email=admin.email,
        action="ADMIN_REJECTED_USER",
        entity_type="user",
        entity_id=target.id,
        details={"reason": req.reason, "applicant_email": target.email},
        user_id=admin.id
    )

    await send_account_rejected_email(target.email, req.reason)

    return {"success": True, "message": f"User {target.email} access request rejected."}

@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Deactivate an active user and invalidate their sessions immediately."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail={"code": "CANNOT_DEACTIVATE_SELF", "message": "You cannot deactivate your own account."})

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND"})

    target.status = "deactivated"
    now = datetime.now(timezone.utc)
    db.query(RefreshSession).filter(
        RefreshSession.user_id == target.id,
        RefreshSession.revoked_at.is_(None)
    ).update({"revoked_at": now})

    db.commit()

    log_audit_event(
        db,
        actor_email=admin.email,
        action="ADMIN_DEACTIVATED_USER",
        entity_type="user",
        entity_id=target.id,
        details={"deactivated_email": target.email},
        user_id=admin.id
    )

    return {"success": True, "message": f"User {target.email} deactivated."}

@router.post("/invitations")
async def create_invitation(
    req: InviteUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Create invitation with token and send real email (§5.1)."""
    org_id = req.organizationId or admin.organization_id
    if not org_id:
        org = db.query(Organization).first()
        org_id = org.id if org else None

    raw_token = generate_random_token(32)
    invitation = Invitation(
        organization_id=org_id,
        email=req.email.lower().strip(),
        role=req.role.lower(),
        token_hash=hash_token(raw_token),
        created_by=admin.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invitation)
    db.commit()

    log_audit_event(
        db,
        actor_email=admin.email,
        action="ADMIN_INVITED_USER",
        entity_type="invitation",
        entity_id=invitation.id,
        details={"invited_email": req.email, "role": req.role},
        user_id=admin.id
    )

    await send_invitation_email(req.email, req.role, raw_token)

    return {"success": True, "message": f"Invitation sent to {req.email}."}

@router.get("/audit-log")
def get_audit_log(
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Read-only audit log feed. Secrets never shown (Section 0.1, 2.5)."""
    query = db.query(AuditLog)
    if actor:
        query = query.filter(AuditLog.actor_email.ilike(f"%{actor}%"))
    if action:
        query = query.filter(AuditLog.action == action)
    
    events = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "actor": e.actor_email,
            "action": e.action,
            "entityType": e.entity_type,
            "entityId": e.entity_id,
            "details": e.details,
            "ipAddress": e.ip_address,
            "timestamp": e.timestamp.isoformat() if e.timestamp else "",
        }
        for e in events
    ]

@router.get("/health")
def get_platform_health(
    db: Session = Depends(get_db),
    admin: User = Depends(admin_guard)
):
    """Platform health with real measurements vs design targets (Section 0.1, 3.5)."""
    metrics = db.query(RequestMetric.duration_ms).order_by(RequestMetric.created_at.desc()).limit(200).all()
    durations = [m[0] for m in metrics]

    p50 = 0.0
    p95 = 0.0
    if durations:
        durations.sort()
        p50 = durations[int(len(durations) * 0.50)]
        p95 = durations[min(int(len(durations) * 0.95), len(durations) - 1)]

    active_users = db.query(User).filter(User.status == "active").count()

    return {
        "apiLatencyP50Ms": round(p50, 1),
        "apiLatencyP95Ms": round(p95, 1),
        "apiLatencyTarget": "< 500 ms (design target)",
        "modelInferenceTarget": "< 3.0 s per image (design target)",
        "activeUsers": active_users,
        "measuredRequestCount": len(durations),
        "status": "healthy"
    }
