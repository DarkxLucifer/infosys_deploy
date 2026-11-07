from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.all_models import Notification, User, WorkOrder
from app.security.jwt import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

def dispatch_notification(
    db: Session,
    user_id: str,
    organization_id: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    event_type: str = "informational",
    alert_level: str = "informational",
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None
) -> Notification:
    """Dispatches a notification conforming to Section 20 event triggers and alert levels."""
    notif = Notification(
        user_id=user_id,
        organization_id=organization_id,
        title=title,
        message=message,
        link=link,
        event_type=event_type,
        alert_level=alert_level,
        entity_type=entity_type,
        entity_id=entity_id
    )
    db.add(notif)
    return notif

def sync_approaching_deadlines(db: Session, current_user: User):
    """
    Checks active work orders approaching SLA deadline (<= 3 days) or overdue,
    generating deadline alerts (Section 20.1 #7).
    """
    now = datetime.now(timezone.utc)

    work_orders = db.query(WorkOrder).filter(
        WorkOrder.organization_id == current_user.organization_id,
        WorkOrder.status.in_(["open", "pending", "in_progress"]),
        WorkOrder.due_date != None
    ).all()

    for wo in work_orders:
        due = wo.due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)

        days_left = (due - now).total_seconds() / 86400.0
        if days_left <= 3.0:
            is_overdue = days_left < 0
            alert_lvl = "critical" if is_overdue else "high"
            action_desc = (wo.action or "Repair task")[:50]
            title = f"Maintenance Overdue: {action_desc}" if is_overdue else f"Maintenance Deadline Approaching: {action_desc}"
            msg = (
                f"Work order {wo.id} is {abs(int(days_left))} day(s) overdue."
                if is_overdue
                else f"Work order {wo.id} is due in {int(days_left) + 1} day(s) ({due.strftime('%Y-%m-%d')})."
            )

            # Check if recently notified (within 24 hours)
            existing = db.query(Notification).filter(
                Notification.user_id == current_user.id,
                Notification.event_type == "maintenance_deadline_approaching",
                Notification.entity_id == wo.id,
                Notification.created_at >= (now - timedelta(hours=24))
            ).first()

            if not existing:
                dispatch_notification(
                    db=db,
                    user_id=current_user.id,
                    organization_id=current_user.organization_id,
                    title=title,
                    message=msg,
                    link="/dashboard/maintenance",
                    event_type="maintenance_deadline_approaching",
                    alert_level=alert_lvl,
                    entity_type="work_order",
                    entity_id=wo.id
                )
    db.commit()

@router.get("")
def list_notifications(
    unread_only: bool = False,
    level: Optional[str] = Query(None, description="Filter by alert level: informational, low, medium, high, critical"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lists real notifications for current user with full Section 20 fields and filtering.
    Dynamically checks approaching deadlines for active maintenance roles.
    """
    try:
        sync_approaching_deadlines(db, current_user)
    except Exception:
        pass

    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    if level and level.lower() != "all":
        query = query.filter(Notification.alert_level == level.lower())
    if event_type and event_type.lower() != "all":
        query = query.filter(Notification.event_type == event_type.lower())

    total = query.count()
    unread_count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()

    items = query.order_by(desc(Notification.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "unreadCount": unread_count,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "body": n.message,
                "link": n.link,
                "eventType": n.event_type,
                "type": n.event_type,
                "level": n.alert_level or "informational",
                "alertLevel": n.alert_level or "informational",
                "entity_type": n.entity_type or ("inspection" if "/inspections/" in (n.link or "") else "work_order" if "/maintenance" in (n.link or "") else "asset"),
                "entity_id": n.entity_id or (n.link.split("/")[-1] if n.link and "/" in n.link else n.id),
                "isRead": n.is_read,
                "createdAt": n.created_at.isoformat() if n.created_at else None
            }
            for n in items
        ]
    }

@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif.is_read = True
    db.commit()

    return {"status": "ok", "id": notif.id, "isRead": True}

@router.post("/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()

    return {"status": "ok", "message": "All notifications marked as read."}
