from datetime import datetime, timedelta, timezone
from typing import Optional, List
import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.all_models import User

security_bearer = HTTPBearer(auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def get_current_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> User:
    raw_token = None
    if auth and auth.credentials:
        raw_token = auth.credentials
    elif token:
        raw_token = token
    elif request.cookies.get("infrascan_access"):
        raw_token = request.cookies.get("infrascan_access")
    elif request.cookies.get("access_token"):
        raw_token = request.cookies.get("access_token")

    if raw_token:
        payload = decode_access_token(raw_token)
        if payload and payload.get("sub"):
            user = db.query(User).filter(User.id == payload["sub"]).first()
            if user:
                if user.status != "active":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "ACCOUNT_INACTIVE", "message": f"Account status is {user.status}"}
                    )
                return user

    # Fallback to active refresh cookie session if available
    refresh_cookie = request.cookies.get("infrascan_refresh")
    if refresh_cookie:
        from app.models.all_models import RefreshSession
        from app.security.tokens import hash_token
        hashed = hash_token(refresh_cookie)
        sess = db.query(RefreshSession).filter(
            RefreshSession.session_token_hash == hashed,
            RefreshSession.is_revoked == False,
            RefreshSession.expires_at > datetime.now(timezone.utc)
        ).first()
        if sess:
            user = db.query(User).filter(User.id == sess.user_id).first()
            if user:
                if user.status != "active":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "ACCOUNT_INACTIVE", "message": f"Account status is {user.status}"}
                    )
                return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHORIZED", "message": "Missing authentication credentials"}
    )

def require_role(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ACCESS_DENIED",
                    "message": f"Role '{current_user.role}' is not authorized for this resource"
                }
            )
        return current_user
    return role_checker
