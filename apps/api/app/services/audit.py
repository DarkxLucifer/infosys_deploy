import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.all_models import AuditLog

logger = logging.getLogger("infrascan.audit")

def log_audit_event(
    db: Session,
    actor_email: str,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_id: Optional[str] = None,
):
    # Scrub sensitive keys if accidentally passed
    sanitized_details = None
    if details:
        sanitized_details = {
            k: ("[REDACTED]" if any(s in k.lower() for s in ["pass", "token", "secret", "cookie", "key"]) else v)
            for k, v in details.items()
        }
    
    event = AuditLog(
        user_id=user_id,
        actor_email=actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=sanitized_details,
        ip_address=ip_address,
    )
    db.add(event)
    try:
        db.commit()
        logger.info(f"AUDIT: [{action}] by {actor_email} on {entity_type}:{entity_id}")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record audit event: {e}")
