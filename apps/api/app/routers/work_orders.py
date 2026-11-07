import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import (
    WorkOrder, WorkOrderEvent, Asset, Inspection, Detection,
    InspectionImage, Measurement, RepairTaskTemplate, User, AuditLog, Notification
)
from app.security.jwt import get_current_user

router = APIRouter(prefix="", tags=["Maintenance & Work Orders"])

ALLOWED_WO_ROLES = {"admin", "manager", "engineer", "civil-engineer", "maintenance"}

def require_wo_access(user: User):
    user_role = (user.role or "").lower()
    if user_role not in ALLOWED_WO_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Your role is not authorized to access maintenance work orders."}
        )

class CreateWorkOrderRequest(BaseModel):
    asset_id: str
    inspection_id: Optional[str] = None
    finding_id: Optional[str] = None
    action: str = Field(..., description="Prescribed repair or remediation action")
    priority: str = Field("medium", description="routine_monitoring, low, medium, high, urgent_engineering_review")
    assignee_id: Optional[str] = None
    team: Optional[str] = None
    due_date: Optional[datetime] = None
    repair_window: Optional[str] = None

class UpdateWorkOrderRequest(BaseModel):
    action: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    team: Optional[str] = None
    due_date: Optional[datetime] = None
    repair_window: Optional[str] = None

class StatusTransitionRequest(BaseModel):
    to_status: str = Field(..., description="'open', 'in_progress', or 'closed'")
    note: Optional[str] = Field(None, description="Resolution note (mandatory when closing)")

VALID_TRANSITIONS = {
    "unassigned": {"open", "in_progress"},
    "open": {"in_progress", "closed"},
    "in_progress": {"open", "closed"},
    "closed": set()  # Terminal state
}

@router.get("/repair-templates")
def list_repair_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_wo_access(current_user)
    templates = db.query(RepairTaskTemplate).all()
    return [
        {
            "id": t.id,
            "damageType": t.damage_type,
            "suggestedAction": t.suggested_action,
            "priority": t.priority,
            "isDevelopmentDefault": t.is_development_default
        }
        for t in templates
    ]

@router.get("/work-orders")
def list_work_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    asset_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_wo_access(current_user)

    q = db.query(WorkOrder).filter(WorkOrder.organization_id == current_user.organization_id)

    if status_filter:
        q = q.filter(WorkOrder.status == status_filter)
    if priority_filter:
        q = q.filter(WorkOrder.priority == priority_filter)
    if asset_id:
        q = q.filter(WorkOrder.asset_id == asset_id)
    if assignee_id:
        q = q.filter(WorkOrder.assignee_id == assignee_id)

    orders = q.order_by(WorkOrder.created_at.desc()).all()

    items = []
    for wo in orders:
        items.append({
            "id": wo.id,
            "assetId": wo.asset_id,
            "assetName": wo.asset.name if wo.asset else "Unknown Asset",
            "inspectionId": wo.inspection_id,
            "findingId": wo.finding_id,
            "action": wo.action,
            "priority": wo.priority,
            "status": wo.status,
            "assigneeId": wo.assignee_id,
            "assigneeName": wo.assignee.name if wo.assignee else None,
            "team": wo.team,
            "dueDate": wo.due_date.isoformat() if wo.due_date else None,
            "repairWindow": wo.repair_window,
            "closedNote": wo.closed_note,
            "createdAt": wo.created_at.isoformat()
        })

    return items

@router.post("/work-orders", status_code=status.HTTP_201_CREATED)
def create_work_order(
    req: CreateWorkOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_wo_access(current_user)

    asset = db.query(Asset).filter(
        Asset.id == req.asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    count = db.query(WorkOrder).filter(WorkOrder.organization_id == current_user.organization_id).count()
    wo_id = f"WO-{count + 1:04d}"

    initial_status = "open" if req.assignee_id else "unassigned"

    wo = WorkOrder(
        id=wo_id,
        organization_id=current_user.organization_id,
        asset_id=req.asset_id,
        inspection_id=req.inspection_id,
        finding_id=req.finding_id,
        action=req.action,
        priority=req.priority,
        assignee_id=req.assignee_id,
        team=req.team,
        due_date=req.due_date,
        repair_window=req.repair_window,
        status=initial_status,
        created_by=current_user.id
    )
    db.add(wo)
    db.flush()

    # Initial event log
    evt = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        from_status="none",
        to_status=initial_status,
        note="Work order created"
    )
    db.add(evt)

    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime('%b %d, %Y at %I:%M %p UTC')
    asset = db.query(Asset).filter(Asset.id == req.asset_id).first()
    asset_name = asset.name if asset else "Asset"

    maint_users = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role.in_(["maintenance", "maintenance-engineer", "maintenance_engineer"]),
        User.status == "active"
    ).all()
    for mu in maint_users:
        db.add(Notification(
            user_id=mu.id,
            organization_id=current_user.organization_id,
            title=f"Work Order Dispatched: {wo.id}",
            message=f"Work Order {wo.id} created for {asset_name} by {current_user.name or current_user.email} on {now_str}. Action: {wo.action} · Priority: {wo.priority.title()}.",
            link="/app/maintenance",
            event_type="maintenance_task_assigned",
            alert_level="high" if wo.priority in ("urgent_engineering_review", "high") else "medium",
            entity_type="work_order",
            entity_id=wo.id
        ))

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="WORK_ORDER_CREATE",
        entity_type="work_order",
        entity_id=wo.id,
        details={"asset_id": req.asset_id, "priority": req.priority, "status": initial_status}
    )
    db.add(audit)
    db.commit()
    db.refresh(wo)

    return {"id": wo.id, "status": wo.status, "priority": wo.priority, "assetId": wo.asset_id}

@router.get("/work-orders/{wo_id}")
def get_work_order(
    wo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_wo_access(current_user)

    wo = db.query(WorkOrder).filter(
        WorkOrder.id == wo_id,
        WorkOrder.organization_id == current_user.organization_id
    ).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")

    asset = wo.asset
    finding = None
    finding_dict = None
    if wo.finding_id:
        finding = db.query(Detection).filter(Detection.id == wo.finding_id).first()
        if finding:
            meas = db.query(Measurement).filter(Measurement.detection_id == finding.id).first()
            finding_dict = {
                "id": finding.id,
                "defectType": finding.defect_type,
                "severity": finding.severity,
                "geometry": finding.geometry,
                "imageId": finding.image_id,
                "measurement": {
                    "length": meas.length if meas else 0,
                    "avgWidth": meas.avg_width if meas else 0,
                    "area": meas.area if meas else 0,
                    "unit": meas.unit if meas else "px",
                    "calibrated": meas.calibrated if meas else False
                } if meas else None
            }

    events = db.query(WorkOrderEvent).filter(
        WorkOrderEvent.work_order_id == wo.id
    ).order_by(WorkOrderEvent.created_at.desc()).all()

    return {
        "id": wo.id,
        "assetId": wo.asset_id,
        "asset": {
            "id": asset.id,
            "name": asset.name,
            "type": asset.asset_type,
            "material": asset.material,
            "region": asset.region,
            "address": asset.address
        } if asset else None,
        "inspectionId": wo.inspection_id,
        "finding": finding_dict,
        "action": wo.action,
        "priority": wo.priority,
        "status": wo.status,
        "assigneeId": wo.assignee_id,
        "assigneeName": wo.assignee.name if wo.assignee else None,
        "team": wo.team,
        "dueDate": wo.due_date.isoformat() if wo.due_date else None,
        "repairWindow": wo.repair_window,
        "closedNote": wo.closed_note,
        "createdAt": wo.created_at.isoformat(),
        "events": [
            {
                "id": e.id,
                "fromStatus": e.from_status,
                "toStatus": e.to_status,
                "actorName": e.actor.name if e.actor else "System",
                "note": e.note,
                "createdAt": e.created_at.isoformat()
            }
            for e in events
        ]
    }

@router.patch("/work-orders/{wo_id}")
def update_work_order(
    wo_id: str,
    req: UpdateWorkOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_wo_access(current_user)

    wo = db.query(WorkOrder).filter(
        WorkOrder.id == wo_id,
        WorkOrder.organization_id == current_user.organization_id
    ).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")

    if req.action:
        wo.action = req.action
    if req.priority:
        wo.priority = req.priority
    if req.team is not None:
        wo.team = req.team
    if req.due_date is not None:
        wo.due_date = req.due_date
    if req.repair_window is not None:
        wo.repair_window = req.repair_window
    if req.assignee_id is not None:
        wo.assignee_id = req.assignee_id
        if wo.status == "unassigned" and req.assignee_id:
            wo.status = "open"

    db.commit()
    db.refresh(wo)
    return {"status": "updated", "id": wo.id}

@router.post("/work-orders/{wo_id}/transition")
def transition_work_order(
    wo_id: str,
    req: StatusTransitionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces MNT-4: Server-enforced status state machine with mandatory closure resolution note."""
    require_wo_access(current_user)

    wo = db.query(WorkOrder).filter(
        WorkOrder.id == wo_id,
        WorkOrder.organization_id == current_user.organization_id
    ).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")

    allowed = VALID_TRANSITIONS.get(wo.status, set())
    if req.to_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_STATE_TRANSITION",
                "message": f"Cannot transition work order from '{wo.status}' to '{req.to_status}'. Valid targets: {list(allowed)}"
            }
        )

    if req.to_status == "closed":
        if not req.note or len(req.note.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "CLOSURE_NOTE_REQUIRED", "message": "A resolution note is required when closing a work order."}
            )
        wo.closed_note = req.note

    from_st = wo.status
    wo.status = req.to_status

    evt = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        from_status=from_st,
        to_status=req.to_status,
        note=req.note
    )
    db.add(evt)

    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime('%b %d, %Y at %I:%M %p UTC')
    asset = wo.asset
    asset_name = asset.name if asset else "Asset"

    if req.to_status == "closed":
        mgr_eng_users = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role.in_(["manager", "infrastructure-manager", "infrastructure_manager", "admin", "engineer", "civil-engineer", "civil_engineer"]),
            User.status == "active"
        ).all()
        for u in mgr_eng_users:
            if u.id != current_user.id:
                db.add(Notification(
                    user_id=u.id,
                    organization_id=current_user.organization_id,
                    title=f"Maintenance Completed: Work Order {wo.id}",
                    message=f"Work Order {wo.id} for {asset_name} was completed and resolved by {current_user.name or current_user.email} on {now_str}. Resolution Note: {req.note}.",
                    link="/app/maintenance",
                    event_type="maintenance_completed",
                    alert_level="informational",
                    entity_type="work_order",
                    entity_id=wo.id
                ))
    elif req.to_status == "in_progress":
        mgr_users = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role.in_(["manager", "infrastructure-manager", "infrastructure_manager", "admin"]),
            User.status == "active"
        ).all()
        for u in mgr_users:
            if u.id != current_user.id:
                db.add(Notification(
                    user_id=u.id,
                    organization_id=current_user.organization_id,
                    title=f"Maintenance In Progress: Work Order {wo.id}",
                    message=f"Work Order {wo.id} for {asset_name} was marked In Progress by {current_user.name or current_user.email} on {now_str}.",
                    link="/app/maintenance",
                    event_type="maintenance_task_assigned",
                    alert_level="informational",
                    entity_type="work_order",
                    entity_id=wo.id
                ))

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="WORK_ORDER_TRANSITION",
        entity_type="work_order",
        entity_id=wo.id,
        details={"from_status": from_st, "to_status": req.to_status, "note": req.note}
    )
    db.add(audit)
    db.commit()

    return {"status": "transitioned", "id": wo.id, "from": from_st, "to": req.to_status}
