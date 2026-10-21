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
    """Enforces Check P3: Strict security headers and no-store caching on auth responses."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
        
        path = request.url.path
        if "/auth/" in path or path.endswith("/login") or path.endswith("/token"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response

