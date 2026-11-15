import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config import settings
from app.database import engine, Base, SessionLocal, ensure_schema_upgrades
from app.models.all_models import User, Organization
from app.middleware import RequestMetricsMiddleware, SecurityHeadersMiddleware
from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.admin import router as admin_router
from app.routers.system import router as system_router
from app.routers.organizations import router as orgs_router
from app.routers.assets import router as assets_router
from app.routers.inspections import router as inspections_router
from app.routers.upload import router as upload_router
from app.routers.datasets import router as datasets_router
from app.routers.notifications import router as notifications_router
from app.routers.dashboards import router as dashboards_router
from app.routers.detections import router as detections_router
from app.routers.work_orders import router as work_orders_router
from app.routers.reports import router as reports_router
from app.routers.analytics import router as analytics_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("infrascan.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize schema
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades(engine)

    # Check first-run administrator status (Section S.5)
    db = SessionLocal()
    try:
        from app.models.all_models import UserCredential, Asset
        from app.security.password import hash_password
        from datetime import datetime, timezone

        # Ensure default organization
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count == 0:
            logger.info("Initializing reference data and default demonstration accounts...")
            try:
                from app.cli import seed_reference_data
                seed_reference_data()
            except Exception as e:
                logger.warning("Could not auto-seed reference data: %s", e)

            now = datetime.now(timezone.utc)
            demo_users = [
                ("System Administrator", "admin@infrascan.local", "admin", "Admin@12345678"),
                ("DarkxLucifer Admin", "yashrajghadage9898@gmail.com", "admin", "Admin@12345678"),
                ("Jane Inspector", "inspector@infrascan.local", "inspector", "Inspector@12345678"),
                ("Bob Civil Engineer", "engineer@infrascan.local", "civil-engineer", "Engineer@12345678"),
                ("Mike Maintenance", "maintenance@infrascan.local", "maintenance", "Maintenance@12345678"),
                ("Alice Manager", "manager@infrascan.local", "manager", "Manager@12345678"),
            ]
            for full_name, email_addr, user_role, plain_pass in demo_users:
                existing = db.query(User).filter(User.email == email_addr).first()
                if not existing:
                    u = User(
                        name=full_name,
                        email=email_addr,
                        role=user_role,
                        status="active",
                        organization_id=org.id,
                        email_verified_at=now,
                    )
                    db.add(u)
                    db.flush()
                    cred = UserCredential(user_id=u.id, password_hash=hash_password(plain_pass))
                    db.add(cred)

            # Ensure at least one default asset for immediate inspection
            asset_count = db.query(Asset).count()
            if asset_count == 0:
                demo_asset = Asset(
                    id="AST-VIADUCT-01",
                    organization_id=org.id,
                    name="Coastal Highway Viaduct - Pier 4",
                    asset_type="bridge",
                    address="104 Ocean Boulevard, Sector 7",
                    latitude=37.7749,
                    longitude=-122.4194,
                    construction_year=2012,
                    material="reinforced_concrete",
                    department="Bridges & Marine Structures",
                    region="Western Coastal",
                    inspection_frequency="Biannual",
                    importance="critical",
                    is_active=True
                )
                db.add(demo_asset)

            db.commit()
            logger.info("Default demonstration accounts & sample asset successfully created.")
        else:
            logger.info("InfraScan administrator registered. Web setup is disabled.")
    finally:
        db.close()

    # Detect & Log Hardware Acceleration
    import torch
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_mb = torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)
        logger.info("CUDA Hardware Acceleration Active: %s (%.0f MB VRAM)", gpu_name, vram_mb)
    else:
        logger.info("CUDA Hardware Acceleration: Not available (Running on CPU)")

    # Load & Warm Up AI Model Service (InfraScan Model v1.0 - ResNet-18)
    try:
        from app.services.classifier import get_classifier
        clf = get_classifier()
        logger.info("InfraScan AI Model initialized: loaded=%s, engine=%s, device=%s, version=%s", clf.is_loaded, clf.engine_type, clf.device, clf.metadata.get("project_model_version"))
    except Exception as e:
        logger.error("Failed initializing classifier in lifespan: %s", e)

    # Preload RF-DETR defect detector at startup
    try:
        from app.services.rfdetr_detector import get_rfdetr_detector
        rfdetr = get_rfdetr_detector()
        logger.info("RF-DETR Medium initialized at startup: loaded=%s (FP16 GPU inference)", rfdetr is not None)
    except Exception as e:
        logger.warning("RF-DETR initialization skipped in lifespan: %s", e)

    # Preload UNet crack segmentation model at startup
    try:
        from app.services.unet_segmentor import get_unet_segmentor
        unet = get_unet_segmentor()
        logger.info("UNet Crack Segmentor initialized at startup: loaded=%s, device=%s", unet is not None, unet.device if unet else None)
    except Exception as e:
        logger.warning("UNet initialization skipped in lifespan: %s", e)

    # Preload YOLO crack detector at startup
    try:
        from app.services.yolo_detector import get_yolo_detector
        yolo = get_yolo_detector()
        logger.info("YOLO Crack Detector initialized at startup: loaded=%s, device=%s", yolo.is_loaded, getattr(yolo.model, 'device', 'cpu'))
    except Exception as e:
        logger.warning("YOLO initialization skipped in lifespan: %s", e)

    yield


app = FastAPI(
    title="InfraScan API Gateway",
    description="Backend API for AI-assisted civil infrastructure inspection & damage assessment",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS configuration
origins = [
    settings.APP_BASE_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics & Logging Middleware
app.add_middleware(RequestMetricsMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Exception handlers for consistent {code, message} structure
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {"msg": "Validation error", "loc": []}
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": "VALIDATION_ERROR",
            "message": first_error.get("msg", "Invalid request parameter"),
            "field": ".".join(str(loc) for loc in first_error.get("loc", []))
        }
    )

# Register v1 Routers
api_v1_prefix = "/api/v1"
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=f"{api_v1_prefix}/users")
app.include_router(admin_router, prefix=api_v1_prefix)
app.include_router(system_router, prefix=api_v1_prefix)
app.include_router(orgs_router, prefix=api_v1_prefix)
app.include_router(assets_router, prefix=api_v1_prefix)
app.include_router(inspections_router, prefix=api_v1_prefix)
app.include_router(upload_router, prefix=api_v1_prefix)
app.include_router(upload_router, prefix="/api")
app.include_router(datasets_router, prefix=api_v1_prefix)
app.include_router(notifications_router, prefix=api_v1_prefix)
app.include_router(dashboards_router, prefix=api_v1_prefix)
app.include_router(detections_router, prefix=api_v1_prefix)
app.include_router(work_orders_router, prefix=api_v1_prefix)
app.include_router(reports_router, prefix=api_v1_prefix)
app.include_router(analytics_router, prefix=api_v1_prefix)


@app.get("/health")
def health():
    return {"status": "ok", "service": "InfraScan API Gateway"}

@app.get("/ready")
def readiness():
    return {"status": "ok", "ready": True}

@app.get(f"{api_v1_prefix}/models/active")
@app.get("/api/models/active")
def get_active_model_status():
    """Returns the loaded status, version, and capabilities of InfraScan AI models."""
    from app.services.classifier import get_classifier
    return get_classifier().get_status()

# Mount static compiled frontend SPA when available (Production / Hugging Face Spaces)
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

dist_candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(os.getcwd()) / "frontend" / "dist",
    Path(os.getcwd()) / "dist",
    Path("/app/frontend/dist"),
    Path("/home/user/app/frontend/dist"),
]
dist_dir = next((d for d in dist_candidates if d.exists() and (d / "index.html").exists()), None)

if dist_dir:
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith(("api/", "api", "docs", "redoc", "openapi.json", "health", "ready")):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = dist_dir / full_path
        if full_path and target_file.is_file():
            return FileResponse(target_file)
        return FileResponse(dist_dir / "index.html")
else:
    @app.get("/")
    def root():
        return {
            "service": "InfraScan API Gateway",
            "docs": "/api/docs",
            "status": "operational",
            "version": "1.0.0"
        }

