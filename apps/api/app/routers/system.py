from fastapi import APIRouter

router = APIRouter(prefix="/system", tags=["System Capabilities & Diagnostics"])

@router.get("/capabilities")
def get_system_capabilities():
    """
    Lists the modules the backend really implements (Section S.6 Rule 4).
    The UI reads this to display honest connection states.
    """
    return {
        "modules": [
            "authentication",
            "roles",
            "audit_log",
            "request_metrics",
            "organizations"
        ],
        "version": "1.0.0",
        "phase": "Phase 1: Foundation, Authentication and Roles",
    }

@router.get("/health")
def get_system_health():
    return {"status": "healthy", "service": "infrascan-api", "version": "1.0.0"}
