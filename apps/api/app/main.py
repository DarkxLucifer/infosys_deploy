import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
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
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count == 0:
            logger.warning("========================================================================")
            logger.warning("  [FIRST STARTUP] NO ADMINISTRATOR ACCOUNT DETECTED.")
            logger.warning("  Use CLI: python -m app.cli create-admin --email <your_email>")
            logger.warning("  OR Web Setup at /setup with one-time token:")
            logger.warning(f"  SETUP TOKEN: {settings.SETUP_TOKEN}")
            logger.warning("========================================================================")
        else:
            logger.info("InfraScan administrator registered. Web setup is disabled.")

        # Ensure default organization
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Primary Infrastructure Authority", allow_self_registration=True)
            db.add(org)
            db.commit()
    finally:
        db.close()

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


@app.get("/")
def root():
    return {
        "service": "InfraScan API Gateway",
        "docs": "/api/docs",
        "status": "operational",
        "version": "1.0.0"
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "InfraScan API Gateway"}

@app.get("/ready")
def readiness():
    return {"status": "ok", "ready": True}
