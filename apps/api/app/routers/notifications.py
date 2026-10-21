from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.all_models import Notification, User
from app.security.jwt import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("")
def list_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Checks M1, M2: List real notifications for current user with unread count and pagination."""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)

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
                "link": n.link,
                "eventType": n.event_type,
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
