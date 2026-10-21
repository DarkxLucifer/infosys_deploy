from datetime import datetime, timezone, timedelta
from app.database import SessionLocal, Base, engine, ensure_schema_upgrades
from app.models.all_models import (
    User, UserCredential, Organization, Asset, Inspection, InspectionImage,
    Detection, Measurement, WorkOrder, DefectType, SeverityLevel,
    PriorityCategory, InfrastructureType, AlertLevel, AuditLog
)
from app.security.password import hash_password

def seed_full_demo():
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades(engine)
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        print("Starting comprehensive demo data seeding...")

        # 1. Organization
        org = db.query(Organization).filter(Organization.name == "Primary Infrastructure Authority").first()
        if not org:
            org = db.query(Organization).first()
        if not org:
            org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
            db.add(org)
            db.flush()

        org_id = org.id

        # 2. Key Users
        user_specs = [
            ("admin@infrascan.local", "System Administrator", "admin"),
            ("inspector@infrascan.local", "Test Inspector", "inspector"),
            ("engineer@infrascan.local", "Test Engineer", "engineer"),
            ("manager@infrascan.local", "Test Manager", "manager"),
            ("maintenance@infrascan.local", "Test Maintenance", "maintenance"),
            ("arjun.nair@infrascan.local", "Arjun Nair", "inspector"),
            ("priya.raghavan@infrascan.local", "Priya Raghavan", "inspector"),
        ]

        users = {}
        for email, name, role in user_specs:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    name=name,
                    email=email,
                    role=role,
                    status="active",
                    email_verified_at=now,
                    organization_id=org_id
                )
                db.add(u)
                db.flush()
                cred = UserCredential(user_id=u.id, password_hash=hash_password("TestPass123!@#"))
                db.add(cred)
            else:
                u.status = "active"
                u.email_verified_at = now
                cred = db.query(UserCredential).filter(UserCredential.user_id == u.id).first()
                if not cred:
                    cred = UserCredential(user_id=u.id, password_hash=hash_password("TestPass123!@#"))
                    db.add(cred)
                else:
                    cred.password_hash = hash_password("TestPass123!@#")
            users[email] = u

        db.commit()

        inspector = users["inspector@infrascan.local"]
        engineer = users["engineer@infrascan.local"]
        manager = users["manager@infrascan.local"]
        maintenance = users["maintenance@infrascan.local"]

        # 3. Real Infrastructure Assets (GPS tagged)
        asset_specs = [
            ("BR-018", "Riverside Overpass — South Deck", "bridge", "Sector 4 · Grid E-2", 40.7128, -74.0060, 1998, "Reinforced concrete", "Structural Maintenance", "Central", "Quarterly", "high"),
            ("BR-031", "Halewood Viaduct — North Bend", "bridge", "Ring Road · Pier 7", 40.7306, -73.9352, 2004, "Prestressed concrete", "Highways Division", "North", "Semi-Annual", "high"),
            ("TU-2042", "Hillcrest Tunnel — East Bore", "tunnel", "Route 9 · Ch. 1+240", 40.7589, -73.9851, 1989, "Cast in-situ concrete", "Tunnels & Transit", "Central", "Monthly", "critical"),
            ("RD-1142", "M-40 Corridor · Km 22–27", "road", "M-40 eastbound", 40.7829, -73.9654, 2016, "Asphalt overlay", "Pavement Operations", "East", "Monthly", "medium"),
            ("RW-0081", "Quarry Access Retaining Wall", "retaining-wall", "Quarry Road Mile 4", 40.6782, -73.9442, 2001, "Concrete block (MSE)", "Slope Stabilization", "South", "Annual", "medium"),
            ("ST-0910", "Stack Exchange Plaza Deck", "building", "Interchange 3 Deck", 40.7061, -74.0092, 2012, "Steel + composite deck", "Urban Assets", "Central", "Quarterly", "low"),
            ("DM-0012", "Pine Ridge Hydro Spillway", "dam", "Pine Ridge Reservoir Dam", 40.8000, -74.1000, 1974, "Mass concrete", "Hydraulic Infrastructure", "North", "Semi-Annual", "critical"),
            ("CV-0341", "Cross-County Culvert C-4", "culvert", "Mile Marker 14 Drainage", 40.6500, -73.8500, 2008, "Precast box culvert", "Drainage Dept", "South", "Annual", "low"),
        ]

        db_assets = {}
        for a_id, name, a_type, addr, lat, lng, yr, mat, dept, reg, freq, imp in asset_specs:
            a = db.query(Asset).filter(Asset.id == a_id, Asset.organization_id == org_id).first()
            if not a:
                a = Asset(
                    id=a_id,
                    organization_id=org_id,
                    name=name,
                    asset_type=a_type,
                    address=addr,
                    latitude=lat,
                    longitude=lng,
                    construction_year=yr,
                    material=mat,
                    department=dept,
                    region=reg,
                    inspection_frequency=freq,
                    importance=imp,
                    is_active=True
                )
                db.add(a)
            else:
                a.name = name
                a.latitude = lat
                a.longitude = lng
                a.asset_type = a_type
                a.region = reg
            db_assets[a_id] = a

        db.commit()

        # 4. Inspections linked to inspector & assets
        inspection_specs = [
            ("INSP-001", "BR-018", inspector.id, "images_uploaded", now - timedelta(days=2), now + timedelta(days=12), "Routine quarterly survey. Multiple cracks spotted under girder."),
            ("INSP-002", "TU-2042", inspector.id, "pending_review", now - timedelta(days=5), now + timedelta(days=9), "Critical lintel spalling and longitudinal crack propagating near arch crown."),
            ("INSP-003", "RD-1142", inspector.id, "assigned", now, now + timedelta(days=14), "Scheduled vehicle-mounted pavement run."),
            ("INSP-004", "BR-031", inspector.id, "reviewed", now - timedelta(days=10), now + timedelta(days=4), "Certified bi-annual inspection. Minor hairline fissures verified."),
            ("INSP-005", "RW-0081", inspector.id, "in_progress", now - timedelta(days=1), now + timedelta(days=13), "Field survey started. Capturing high-resolution camera frames."),
        ]

        for i_id, a_id, insp_id, st, i_date, d_date, nts in inspection_specs:
            insp = db.query(Inspection).filter(Inspection.id == i_id).first()
            if not insp:
                insp = Inspection(
                    id=i_id,
                    organization_id=org_id,
                    asset_id=a_id,
                    inspector_id=insp_id,
                    status=st,
                    inspection_date=i_date,
                    due_date=d_date,
                    notes=nts,
                    analysis_status="complete" if st in ("pending_review", "reviewed") else "skipped_no_model"
                )
                db.add(insp)
            else:
                insp.status = st
                insp.inspector_id = insp_id
                insp.asset_id = a_id

        db.commit()

        # 5. Work Orders
        wo_specs = [
            ("WO-101", "TU-2042", "INSP-002", "Emergency lintel stitching and pressure injection", "urgent_engineering_review", "Tunnels Emergency Squad", now + timedelta(days=2), "open"),
            ("WO-102", "BR-018", "INSP-001", "High-pressure epoxy injection for girder crack G3", "high", "Bridge Repair Team Alpha", now + timedelta(days=7), "in_progress"),
            ("WO-103", "RD-1142", "INSP-003", "Asphalt overlay sealing across eastbound lanes", "medium", "Pavement Operations", now + timedelta(days=14), "scheduled"),
            ("WO-104", "BR-031", "INSP-004", "Joint J-4 re-sealing and elastomeric bearing cleanup", "low", "Bridge Maintenance", now - timedelta(days=2), "closed"),
        ]

        for w_id, a_id, insp_id, act, prio, team, due, st in wo_specs:
            wo = db.query(WorkOrder).filter(WorkOrder.id == w_id).first()
            if not wo:
                wo = WorkOrder(
                    id=w_id,
                    organization_id=org_id,
                    asset_id=a_id,
                    inspection_id=insp_id,
                    action=act,
                    priority=prio,
                    team=team,
                    due_date=due,
                    status=st,
                    created_by=manager.id,
                    closed_note="Completed and verified by maintenance lead." if st == "closed" else None
                )
                db.add(wo)
            else:
                wo.status = st
                wo.action = act

        db.commit()
        print("SUCCESS: Comprehensive demo data seeded successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_full_demo()
