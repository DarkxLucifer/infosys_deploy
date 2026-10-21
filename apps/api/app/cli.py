import sys
import getpass
import argparse
import csv
from datetime import datetime, timezone
from app.database import SessionLocal, Base, engine
from app.models.all_models import (
    User, UserCredential, Organization, DefectType, SeverityLevel,
    PriorityCategory, InfrastructureType, AlertLevel, AuditLog,
    Dataset, DatasetInspectionStat, DatasetClassStat
)
from app.security.password import hash_password, validate_password_strength

def init_tables():
    Base.metadata.create_all(bind=engine)

def create_admin(email: str, name: str = "System Administrator"):
    init_tables()
    db = SessionLocal()
    try:
        email_clean = email.strip().lower()
        print(f"Creating administrator account for: {email_clean}")
        password = getpass.getpass("Enter administrator password (min 12 characters): ")
        password_confirm = getpass.getpass("Confirm password: ")

        if password != password_confirm:
            print("ERROR: Passwords do not match.")
            sys.exit(1)

        is_valid, err_msg = validate_password_strength(password, name, email_clean)
        if not is_valid:
            print(f"ERROR: {err_msg}")
            sys.exit(1)

        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
            db.add(org)
            db.flush()

        existing = db.query(User).filter(User.email == email_clean).first()
        now = datetime.now(timezone.utc)
        if existing:
            existing.role = "admin"
            existing.status = "active"
            existing.email_verified_at = now
            admin_user = existing
        else:
            admin_user = User(
                name=name,
                email=email_clean,
                role="admin",
                status="active",
                email_verified_at=now,
                organization_id=org.id,
            )
            db.add(admin_user)
            db.flush()

        cred = db.query(UserCredential).filter(UserCredential.user_id == admin_user.id).first()
        if not cred:
            cred = UserCredential(user_id=admin_user.id, password_hash=hash_password(password))
            db.add(cred)
        else:
            cred.password_hash = hash_password(password)

        audit = AuditLog(
            user_id=admin_user.id,
            actor_email=admin_user.email,
            action="CLI_CREATE_ADMIN",
            entity_type="user",
            entity_id=admin_user.id,
            details={"email": admin_user.email, "role": "admin"}
        )
        db.add(audit)
        db.commit()
        print(f"SUCCESS: Administrator {email_clean} created and activated successfully.")
    finally:
        db.close()

def seed_reference_data():
    """Seeds reference categories and Seed Org (Rule 4: never creates user accounts)."""
    init_tables()
    db = SessionLocal()
    try:
        print("Seeding reference data from InfraScan Specification...")
        # Organization
        seed_org = db.query(Organization).filter(Organization.name == "Seed Org (development data)").first()
        if not seed_org:
            seed_org = Organization(name="Seed Org (development data)", allow_self_registration=False)
            db.add(seed_org)

        # 8 Crack Categories (§5.7)
        crack_defects = [
            ("D00", "Longitudinal crack", "Crack oriented parallel to structural axis", "crack"),
            ("D10", "Transverse crack", "Crack oriented perpendicular to structural axis", "crack"),
            ("D11", "Diagonal / shear crack", "Inclined crack formed under shear stress", "crack"),
            ("D20", "Alligator / map fatigue cracking", "Interconnected polygonal crack network", "crack"),
            ("D30", "Reflection crack", "Crack propagating through pavement overlay from sub-layer", "crack"),
            ("D40", "Lateral crack", "Crack running across member boundary or joints", "crack"),
            ("D50", "Block cracking", "Rectangular interconnected cracking grid pattern", "crack"),
            ("D60", "Edge cracking", "Cracking along unsupported shoulder or member edge", "crack"),
        ]
        for code, name, desc, cat in crack_defects:
            existing = db.query(DefectType).filter(DefectType.code == code).first()
            if not existing:
                db.add(DefectType(code=code, name=name, description=desc, category=cat))
            else:
                existing.name = name
                existing.description = desc
                existing.category = cat

        # 9 Surface Damage Categories (§5.8)
        surface_defects = [
            ("S01", "Surface spalling & fragment loss", "Detachment and loss of surface concrete fragments", "surface_damage"),
            ("S02", "Exposed reinforcement & rebar corrosion", "Corroded rebar exposed to moisture/atmosphere", "surface_damage"),
            ("S03", "Efflorescence & salt leaching", "Crystalline salt deposit on concrete surface", "surface_damage"),
            ("S04", "Honeycombing & voiding", "Coarse aggregate voids due to incomplete compaction", "surface_damage"),
            ("S05", "Scaling & surface disintegration", "Loss of surface mortar matrix exposing coarse aggregates", "surface_damage"),
            ("S06", "Popouts", "Conical shallow depressions caused by expansive internal aggregates", "surface_damage"),
            ("S07", "Abrasion & wear", "Mechanical surface erosion from traffic or abrasive fluids", "surface_damage"),
            ("S08", "Water seepage & moisture staining", "Active dampness or chemical staining from liquid migration", "surface_damage"),
            ("S09", "Delamination", "Sub-surface planar separation of near-surface concrete layer", "surface_damage"),
        ]
        for code, name, desc, cat in surface_defects:
            existing = db.query(DefectType).filter(DefectType.code == code).first()
            if not existing:
                db.add(DefectType(code=code, name=name, description=desc, category=cat))
            else:
                existing.name = name
                existing.description = desc
                existing.category = cat

        # 5 Severity Levels (§5.10)
        severities = [
            ("no_visible_damage", "No Visible Damage", "Surface shows no active crack indicators", 0),
            ("minor", "Minor Damage", "Hairline cracking without structural displacement", 1),
            ("moderate", "Moderate Damage", "Progressed crack opening requiring routine maintenance", 2),
            ("severe", "Severe Damage", "Substantial crack depth or branching requiring priority intervention", 3),
            ("critical", "Critical / Requires Urgent Engineering Review", "Severe structural condition requiring immediate qualified engineering review", 4),
        ]
        for code, name, desc, rank in severities:
            existing = db.query(SeverityLevel).filter(SeverityLevel.code == code).first()
            if not existing:
                db.add(SeverityLevel(code=code, name=name, description=desc, level_rank=rank))
            else:
                existing.name = name
                existing.description = desc
                existing.level_rank = rank

        # 5 Priority Categories
        priorities = [
            ("P1", "Emergency Intervention", "Immediate safety risk requiring emergency closure or shoring", 1),
            ("P2", "High Priority", "Active deterioration requiring intervention within 30 days", 30),
            ("P3", "Medium Priority", "Progression noted; schedule work order within 90 days", 90),
            ("P4", "Low Priority", "Non-structural degradation; monitor and repair within 180 days", 180),
            ("P5", "Routine Monitoring", "Acceptable condition; re-inspect during annual inspection cycle", 365),
        ]
        for code, name, desc, sla in priorities:
            existing = db.query(PriorityCategory).filter(PriorityCategory.code == code).first()
            if not existing:
                db.add(PriorityCategory(code=code, name=name, description=desc, sla_days=sla))
            else:
                existing.name = name
                existing.description = desc
                existing.sla_days = sla

        # 8 Infrastructure Types
        infra_types = [
            ("bridge", "Bridge", "Overpass, viaduct, or river crossing structure"),
            ("road", "Road corridor", "Highway, arterial corridor, or interchange surface"),
            ("tunnel", "Tunnel", "Subterranean transportation or utility passage"),
            ("retaining-wall", "Retaining wall", "Soil retention structure or embankment stabilizer"),
            ("building", "Structure deck / Building", "Deck, commercial parking facility, or transit terminal"),
            ("dam", "Dam / Reservoir spillway", "Water retention barrage, weir, or discharge spillway"),
            ("culvert", "Culvert", "Drainage or hydrological conduit crossing underneath roadway"),
            ("pier", "Pier / Marine structure", "Port berth, jetty, or marine foundation column"),
        ]
        for code, name, desc in infra_types:
            existing = db.query(InfrastructureType).filter(InfrastructureType.code == code).first()
            if not existing:
                db.add(InfrastructureType(code=code, name=name, description=desc))
            else:
                existing.name = name
                existing.description = desc

        # 5 Alert Levels
        alert_levels = [
            ("green", "Normal / Operational", "Structure in sound service condition with standard margins", 0),
            ("blue", "Advisory", "Minor deviation observed; informational alert", 1),
            ("yellow", "Caution / Elevated Watch", "Defect rate accelerating; scheduled re-inspection needed", 2),
            ("orange", "Warning / Impaired Margin", "Structural safety margin reduced; engineering review active", 3),
            ("red", "Critical Alert", "Immediate intervention or structural load restriction triggered", 4),
        ]
        for code, name, desc, order in alert_levels:
            existing = db.query(AlertLevel).filter(AlertLevel.code == code).first()
            if not existing:
                db.add(AlertLevel(code=code, name=name, description=desc, severity_order=order))
            else:
                existing.name = name
                existing.description = desc
                existing.severity_order = order

        db.commit()
        print("SUCCESS: 8 crack categories, 9 surface damage categories, 5 severity levels, 5 priority categories, 8 infrastructure types, 5 alert levels initialized successfully.")
    finally:
        db.close()

def import_eda(csv_path: str = None):
    """Imports benchmark dataset EDA metrics with row validation and idempotent upsert."""
    init_tables()
    db = SessionLocal()
    try:
        # Default benchmark datasets if no file provided
        if not csv_path:
            datasets_data = [
                {
                    "id": "SDNET2018",
                    "name": "SDNET2018 Concrete Crack Benchmark",
                    "purpose": "Multi-class concrete crack classification across bridge decks, pavements, and walls.",
                    "suitability_limits": "Classification-only benchmark; cannot support semantic segmentation or physical crack width measurement.",
                    "license_note": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
                    "total_samples": 56098,
                    "metrics": [("mean_width_px", 256.0), ("mean_height_px", 256.0), ("mean_luminance", 148.2)],
                    "classes": [("D00", "Crack present", 23098), ("OK", "Uncracked", 33000)],
                },
                {
                    "id": "METU",
                    "name": "Concrete Crack Images (CCIC / METU)",
                    "purpose": "Binary concrete crack classification for CNN & transfer learning baseline calibration.",
                    "suitability_limits": "Classification-only dataset; no pixel masks or bounding box coordinates provided.",
                    "license_note": "Academic Research Use License (Özgenel & Sorguç, METU)",
                    "total_samples": 40000,
                    "metrics": [("mean_width_px", 227.0), ("mean_height_px", 227.0), ("mean_luminance", 162.5)],
                    "classes": [("D00", "Positive / Cracked", 20000), ("OK", "Negative / Clean", 20000)],
                },
                {
                    "id": "RDD2022",
                    "name": "Road Damage Dataset 2022 (RDD2022)",
                    "purpose": "Multi-country multi-class road damage object detection and localization.",
                    "suitability_limits": "Object detection bounding boxes only; does not provide pixel-level polygon segmentation masks.",
                    "license_note": "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)",
                    "total_samples": 47420,
                    "metrics": [("mean_width_px", 720.0), ("mean_height_px", 720.0), ("mean_luminance", 132.8)],
                    "classes": [("D00", "Longitudinal crack", 14200), ("D10", "Transverse crack", 9800), ("D20", "Alligator crack", 11200), ("D40", "Rutting / bump", 12220)],
                },
                {
                    "id": "CFD",
                    "name": "CrackForest Dataset (CFD)",
                    "purpose": "Pixel-level crack localization and semantic segmentation on urban road surfaces under shadows.",
                    "suitability_limits": "Suitable for semantic segmentation; limited geographic diversity (urban road surfaces only).",
                    "license_note": "Academic Open Source License (Shi et al.)",
                    "total_samples": 118,
                    "metrics": [("mean_width_px", 480.0), ("mean_height_px", 320.0), ("mean_luminance", 115.4)],
                    "classes": [("D00", "Crack boundary mask", 118)],
                },
                {
                    "id": "CRACK500",
                    "name": "CRACK500 High-Resolution Dataset",
                    "purpose": "High-resolution structural crack segmentation and boundary morphology benchmarking.",
                    "suitability_limits": "Semantic segmentation and morphology analysis; requires tiling for GPU inference.",
                    "license_note": "Academic Research Benchmark License (Yang et al.)",
                    "total_samples": 3368,
                    "metrics": [("mean_width_px", 2000.0), ("mean_height_px", 1500.0), ("mean_luminance", 124.6)],
                    "classes": [("D00", "Crack pixel mask", 3368)],
                },
            ]

            for ds in datasets_data:
                dataset_obj = db.query(Dataset).filter(Dataset.id == ds["id"]).first()
                if not dataset_obj:
                    dataset_obj = Dataset(
                        id=ds["id"],
                        name=ds["name"],
                        purpose=ds["purpose"],
                        suitability_limits=ds["suitability_limits"],
                        license_note=ds["license_note"],
                        total_samples=ds["total_samples"],
                    )
                    db.add(dataset_obj)
                else:
                    dataset_obj.name = ds["name"]
                    dataset_obj.purpose = ds["purpose"]
                    dataset_obj.suitability_limits = ds["suitability_limits"]
                    dataset_obj.license_note = ds["license_note"]
                    dataset_obj.total_samples = ds["total_samples"]

                db.query(DatasetInspectionStat).filter(DatasetInspectionStat.dataset_id == ds["id"]).delete()
                for m_name, m_val in ds["metrics"]:
                    db.add(DatasetInspectionStat(dataset_id=ds["id"], metric_name=m_name, metric_value=m_val))

                db.query(DatasetClassStat).filter(DatasetClassStat.dataset_id == ds["id"]).delete()
                for c_code, c_name, c_cnt in ds["classes"]:
                    db.add(DatasetClassStat(dataset_id=ds["id"], class_code=c_code, class_name=c_name, sample_count=c_cnt))

            db.commit()
            print("SUCCESS: Default 5 EDA datasets imported idempotently.")
            return True

        # Process external CSV file with strict validation
        print(f"Reading and validating EDA CSV file: {csv_path}")
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            required_cols = {"dataset_id", "name", "purpose", "suitability_limits", "license_note", "total_samples"}
            if not required_cols.issubset(set(reader.fieldnames or [])):
                missing = required_cols - set(reader.fieldnames or [])
                raise ValueError(f"Malformed CSV: missing required headers: {missing}")

            rows = list(reader)
            # Validate each row
            for idx, r in enumerate(rows, start=1):
                if not r.get("dataset_id") or not r.get("name"):
                    raise ValueError(f"Row {idx} malformed: dataset_id and name are required")
                try:
                    int(r.get("total_samples", 0))
                except ValueError:
                    raise ValueError(f"Row {idx} malformed: total_samples must be integer")

            # All rows valid -> upsert
            for r in rows:
                ds_id = r["dataset_id"].strip()
                existing_ds = db.query(Dataset).filter(Dataset.id == ds_id).first()
                if not existing_ds:
                    existing_ds = Dataset(
                        id=ds_id,
                        name=r["name"].strip(),
                        purpose=r.get("purpose", "").strip(),
                        suitability_limits=r.get("suitability_limits", "").strip(),
                        license_note=r.get("license_note", "").strip(),
                        total_samples=int(r.get("total_samples", 0)),
                    )
                    db.add(existing_ds)
                else:
                    existing_ds.name = r["name"].strip()
                    existing_ds.purpose = r.get("purpose", "").strip()
                    existing_ds.suitability_limits = r.get("suitability_limits", "").strip()
                    existing_ds.license_note = r.get("license_note", "").strip()
                    existing_ds.total_samples = int(r.get("total_samples", 0))

            db.commit()
            print(f"SUCCESS: Successfully imported {len(rows)} datasets from {csv_path}.")
            return True
    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to import EDA CSV: {e}", file=sys.stderr)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="InfraScan CLI Tool")
    subparsers = parser.add_subparsers(dest="command")

    create_admin_parser = subparsers.add_parser("create-admin", help="Create first administrator")
    create_admin_parser.add_argument("--email", required=True, help="Administrator email address")
    create_admin_parser.add_argument("--name", default="System Administrator", help="Administrator full name")

    seed_parser = subparsers.add_parser("seed", help="Seed reference datasets and categories")

    eda_parser = subparsers.add_parser("import-eda", help="Import EDA dataset metrics from CSV")
    eda_parser.add_argument("--file", help="Path to EDA CSV file (optional, defaults to standard benchmarks)")

    args = parser.parse_args()
    if args.command == "create-admin":
        create_admin(args.email, args.name)
    elif args.command == "seed":
        seed_reference_data()
    elif args.command == "import-eda":
        import_eda(args.file)
    else:
        parser.print_help()

