from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False, "timeout": 60}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

from sqlalchemy import event

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=60000")
            cursor.execute("PRAGMA cache_size=-64000")
            cursor.execute("PRAGMA temp_store=MEMORY")
            cursor.close()
        except Exception:
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def ensure_schema_upgrades(engine):
    """Ensures existing SQLite / Postgres tables receive new columns and default seeds."""
    from sqlalchemy import text
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            try:
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(assets)")).fetchall()]
                if "region" not in cols:
                    conn.execute(text("ALTER TABLE assets ADD COLUMN region VARCHAR(128) DEFAULT 'Central'"))
                    conn.commit()
            except Exception:
                pass

            try:
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(inspections)")).fetchall()]
                if "method" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN method VARCHAR(32) DEFAULT 'walkdown'"))
                if "analysis_status" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN analysis_status VARCHAR(32) DEFAULT 'skipped_no_model'"))
                if "claimed_by" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN claimed_by VARCHAR(64) DEFAULT NULL"))
                if "claimed_at" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN claimed_at DATETIME DEFAULT NULL"))
                if "submitted_at" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN submitted_at DATETIME DEFAULT NULL"))
                if "reviewed_at" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN reviewed_at DATETIME DEFAULT NULL"))
                if "previous_inspection_id" not in cols:
                    conn.execute(text("ALTER TABLE inspections ADD COLUMN previous_inspection_id VARCHAR(64) DEFAULT NULL"))
                conn.commit()
            except Exception:
                pass

            try:
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(inspection_images)")).fetchall()]
                if "quality_status" not in cols:
                    conn.execute(text("ALTER TABLE inspection_images ADD COLUMN quality_status VARCHAR(32) DEFAULT 'accepted'"))
                if "processing_status" not in cols:
                    conn.execute(text("ALTER TABLE inspection_images ADD COLUMN processing_status VARCHAR(32) DEFAULT 'complete'"))
                if "warning_confirmed_by" not in cols:
                    conn.execute(text("ALTER TABLE inspection_images ADD COLUMN warning_confirmed_by VARCHAR(64) DEFAULT NULL"))
                if "warning_confirmed_at" not in cols:
                    conn.execute(text("ALTER TABLE inspection_images ADD COLUMN warning_confirmed_at DATETIME DEFAULT NULL"))
                conn.commit()
            except Exception:
                pass

            try:
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(notifications)")).fetchall()]
                if "alert_level" not in cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN alert_level VARCHAR(32) DEFAULT 'informational'"))
                if "entity_type" not in cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN entity_type VARCHAR(64) DEFAULT NULL"))
                if "entity_id" not in cols:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN entity_id VARCHAR(64) DEFAULT NULL"))
                conn.commit()
            except Exception:
                pass

    # Seed development defaults
    try:
        from app.models.all_models import SeverityRule, PriorityRule, RepairTaskTemplate
        db = SessionLocal()
        try:
            if db.query(SeverityRule).count() == 0:
                default_sev_rule = SeverityRule(
                    version="v1.0-default",
                    weights={"crack_width": 0.35, "crack_length": 0.20, "crack_density": 0.20, "damage_type": 0.15, "material": 0.10},
                    thresholds={
                        "width_mm": {"minor": 1.0, "moderate": 3.0, "severe": 6.0, "critical": 10.0},
                        "length_mm": {"minor": 500, "moderate": 1500, "severe": 3000, "critical": 5000},
                        "density_pct": {"minor": 1.0, "moderate": 5.0, "severe": 10.0, "critical": 20.0},
                        "label": "Development default, not an engineering standard"
                    },
                    created_by="system",
                    is_development_default=True
                )
                db.add(default_sev_rule)

            if db.query(PriorityRule).count() == 0:
                default_prio_rule = PriorityRule(
                    version="v1.0-default",
                    weights={"severity": 0.40, "importance": 0.25, "progression": 0.15, "history": 0.10, "asset_type": 0.10},
                    risk_factors={"coastal_corrosion": 1.2, "heavy_freight_route": 1.3, "seismic_zone": 1.15, "label": "Development default, not an engineering standard"},
                    created_by="system",
                    is_development_default=True
                )
                db.add(default_prio_rule)

            if db.query(RepairTaskTemplate).count() == 0:
                templates = [
                    RepairTaskTemplate(damage_type="longitudinal", suggested_action="Epoxy injection and surface sealing along crack line", priority="medium", is_development_default=True),
                    RepairTaskTemplate(damage_type="transverse", suggested_action="Polyurethane grouting and structural stitch welding if active", priority="high", is_development_default=True),
                    RepairTaskTemplate(damage_type="alligator", suggested_action="Sub-base stabilization, milling and asphalt overlay", priority="high", is_development_default=True),
                    RepairTaskTemplate(damage_type="spalling", suggested_action="Chipping back to sound concrete, rust conversion on rebar, polymer patch mortar", priority="severe", is_development_default=True),
                    RepairTaskTemplate(damage_type="corrosion", suggested_action="Anti-carbonation coating and sacrificial galvanic anode installation", priority="medium", is_development_default=True),
                    RepairTaskTemplate(damage_type="exposed_reinforcement", suggested_action="Abrasive blast cleaning, zinc-rich primer application, structural repair mortar", priority="urgent_engineering_review", is_development_default=True),
                    RepairTaskTemplate(damage_type="potholes", suggested_action="Full-depth saw cutting, asphalt tack coat, compacted hot mix asphalt", priority="medium", is_development_default=True),
                    RepairTaskTemplate(damage_type="water_leakage", suggested_action="Crystalline waterproofing injection and drainage relief hole installation", priority="medium", is_development_default=True),
                    RepairTaskTemplate(damage_type="hairline", suggested_action="Penetrating silane/siloxane sealer application and routine monitoring", priority="low", is_development_default=True),
                ]
                for t in templates:
                    db.add(t)
            db.commit()
        finally:
            db.close()
    except Exception:
        pass

