from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.all_models import Organization

router = APIRouter(prefix="/organizations", tags=["Organizations"])

@router.get("/public")
def get_public_organizations(db: Session = Depends(get_db)):
    """Organisations that allow self-registration (Section 2.4)."""
    orgs = db.query(Organization).filter(Organization.allow_self_registration.is_(True)).all()
    if not orgs:
        # Seed default authority if empty
        default_org = Organization(name="Metropolitan Infrastructure Authority", allow_self_registration=True)
        db.add(default_org)
        db.commit()
        db.refresh(default_org)
        orgs = [default_org]

    return [{"id": o.id, "name": o.name} for o in orgs]
