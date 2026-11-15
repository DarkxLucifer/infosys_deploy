import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.database import SessionLocal
from app.models.all_models import RequestMetric

logger = logging.getLogger("infrascan.middleware")

class RequestMetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        # Don't log metrics for static assets or docs
        path = request.url.path
        if not path.startswith("/api"):
            return response

        response.headers["X-Process-Time-Ms"] = str(round(duration_ms, 2))

        # Insert record into request_metrics
        db = SessionLocal()
        try:
            metric = RequestMetric(
                route=path,
                method=request.method,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
            db.add(metric)
            db.commit()
        except Exception as e:
            logger.debug(f"Failed to record request metric: {e}")
        finally:
            db.close()
        return response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforces strict security headers, GIS/tile resource permissions, and no-store caching on auth responses."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy supporting GIS Map Tiles (CartoDB, OpenStreetMap), Leaflet assets, and Dicebear avatars
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://api.dicebear.com https://unpkg.com; "
            "connect-src 'self' https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org; "
            "frame-ancestors 'self' https://huggingface.co https://*.huggingface.co; "
            "base-uri 'self';"
        )
        response.headers["Content-Security-Policy"] = csp
        
        path = request.url.path
        if "/auth/" in path or path.endswith("/login") or path.endswith("/token"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response

