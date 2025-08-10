"""
Authentication integration for Knowledge Base API.

Supports two auth modes:
- External auth service via bearer token validation
- Built-in admin account (env: admin_username/admin_password) using local JWT
"""

import os
import httpx
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app import crud
from app.models import UserPermissions, UserRole
from jose import jwt, JWTError

# Configuration
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://192.168.1.117:8000")
TIMEOUT = 10.0

# Local admin configuration (support both lower/upper case env names)
ADMIN_USERNAME = (
    os.getenv("admin_username")
    or os.getenv("ADMIN_USERNAME")
)
ADMIN_PASSWORD = (
    os.getenv("admin_password")
    or os.getenv("ADMIN_PASSWORD")
)

# Local JWT configuration for built-in admin
JWT_SECRET = os.getenv("JWT_SECRET", "kb_local_secret_change_me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ISSUER = os.getenv("JWT_ISSUER", "kb-backend")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "43200"))  # 30 days

# Security scheme
security = HTTPBearer(auto_error=False)

class UserInfo(BaseModel):
    """User information from authentication service"""
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    disabled: bool = False

class AuthenticatedUser(BaseModel):
    """Extended user info with permissions"""
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    disabled: bool = False
    # Store permissions as dict instead of SQLAlchemy object
    permissions: Optional[dict] = None
    user_role: Optional[str] = None
    
    class Config:
        arbitrary_types_allowed = True
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission"""
        if not self.permissions:
            return False
        return self.permissions.get(f"can_{permission}", False)
    
    def is_admin_or_moderator(self) -> bool:
        """Check if user has admin or moderator privileges"""
        if not self.user_role:
            return False
        return self.user_role in ['admin', 'moderator']


def _create_local_admin_token() -> str:
    """Create a locally signed JWT for the built-in admin user."""
    # Use fixed internal user id 0 for local admin
    to_encode = {
        "sub": "0",
        "username": ADMIN_USERNAME or "admin",
        "role": "admin",
        "is_local_admin": True,
        "iss": JWT_ISSUER,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MINUTES),
    }
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_local_admin_token() -> str:
    """Public helper to create a local admin token (used by /auth/login)."""
    return _create_local_admin_token()


def _try_decode_local_admin_token(token: str) -> Optional[UserInfo]:
    """Attempt to decode a locally issued admin token.

    Returns a UserInfo if valid and intended for local admin, else None.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_aud": False})
        if payload.get("iss") != JWT_ISSUER:
            return None
        if not payload.get("is_local_admin"):
            return None
        # Build UserInfo for local admin
        return UserInfo(
            id=0,
            username=payload.get("username") or ADMIN_USERNAME or "admin",
            email=None,
            full_name="Administrator",
            disabled=False,
        )
    except JWTError:
        return None

class AuthService:
    """Service to interact with external authentication API"""
    
    def __init__(self, base_url: str = AUTH_SERVICE_URL):
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=TIMEOUT)
    
    async def validate_token(self, token: str) -> Optional[UserInfo]:
        """Validate token from either local admin or external auth service."""
        # 1) Try local admin JWT first
        local_user = _try_decode_local_admin_token(token)
        if local_user is not None:
            return local_user

        # 2) Fallback to external auth service
        try:
            headers = {"Authorization": f"Bearer {token}"}
            response = await self.client.get(
                f"{self.base_url}/validate-token",
                headers=headers
            )
            if response.status_code == 200:
                user_response = await self.client.get(
                    f"{self.base_url}/users/me",
                    headers=headers
                )
                if user_response.status_code == 200:
                    user_data = user_response.json()
                    return UserInfo(**user_data)
            return None
        except Exception as e:
            print(f"Auth service error: {e}")
            return None
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

# Global auth service instance
auth_service = AuthService()

async def get_auth_service() -> AuthService:
    """Dependency to get auth service instance"""
    return auth_service

async def get_current_user_with_permissions(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AuthService = Depends(get_auth_service),
    db: Session = Depends(get_db)
) -> AuthenticatedUser:
    """Get current user with permissions from token"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await auth_service.validate_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get or create user permissions; local admin gets ADMIN role by default
    user_id = str(user.id)
    permissions = crud.get_user_permissions(db, user_id)

    is_local_admin = (user.id == 0) or (ADMIN_USERNAME and user.username == ADMIN_USERNAME)

    if not permissions:
        # Create with appropriate default role
        default_role = UserRole.ADMIN if is_local_admin else UserRole.VIEWER
        permissions = crud.create_or_update_user_permissions(
            db,
            user_id=user_id,
            username=user.username,
            email=user.email,
            role=default_role,
        )
    else:
        # Ensure local admin remains admin
        if is_local_admin and permissions.role != UserRole.ADMIN:
            crud.update_user_role(db, user_id, UserRole.ADMIN)
            permissions = crud.get_user_permissions(db, user_id)
        # Update user info and last login
        crud.create_or_update_user_permissions(
            db,
            user_id=user_id,
            username=user.username,
            email=user.email,
        )
    
    return AuthenticatedUser(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        disabled=user.disabled,
        permissions={
            'can_view_private': permissions.can_view_private,
            'can_create_articles': permissions.can_create_articles,
            'can_edit_articles': permissions.can_edit_articles,
            'can_delete_articles': permissions.can_delete_articles,
            'can_manage_users': permissions.can_manage_users,
            'can_view_analytics': permissions.can_view_analytics,
        },
        user_role=permissions.role.value
    )

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AuthService = Depends(get_auth_service)
) -> UserInfo:
    """Get current user from token (without permissions for backward compatibility)"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await auth_service.validate_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

async def get_current_user_optional_with_permissions(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AuthService = Depends(get_auth_service),
    db: Session = Depends(get_db)
) -> Optional[AuthenticatedUser]:
    """Optional authentication with permissions - returns None if not authenticated"""
    if not credentials:
        return None
    
    try:
        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            return None
        
        # Get or create user permissions (ensure local admin = ADMIN)
        user_id = str(user.id)
        permissions = crud.get_user_permissions(db, user_id)
        is_local_admin = (user.id == 0) or (ADMIN_USERNAME and user.username == ADMIN_USERNAME)

        if not permissions:
            default_role = UserRole.ADMIN if is_local_admin else UserRole.VIEWER
            permissions = crud.create_or_update_user_permissions(
                db,
                user_id=user_id,
                username=user.username,
                email=user.email,
                role=default_role,
            )
        else:
            if is_local_admin and permissions.role != UserRole.ADMIN:
                crud.update_user_role(db, user_id, UserRole.ADMIN)
                permissions = crud.get_user_permissions(db, user_id)
        
        return AuthenticatedUser(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            disabled=user.disabled,
            permissions={
                'can_view_private': permissions.can_view_private,
                'can_create_articles': permissions.can_create_articles,
                'can_edit_articles': permissions.can_edit_articles,
                'can_delete_articles': permissions.can_delete_articles,
                'can_manage_users': permissions.can_manage_users,
                'can_view_analytics': permissions.can_view_analytics,
            },
            user_role=permissions.role.value
        )
    except Exception:
        return None


async def get_current_active_user(
    current_user: UserInfo = Depends(get_current_user)
) -> UserInfo:
    """Get current active user (not disabled)"""
    if current_user.disabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user

# Optional: Make authentication optional for some endpoints
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AuthService = Depends(get_auth_service)
) -> Optional[UserInfo]:
    """Get current user from token (optional - returns None if not authenticated)"""
    if not credentials:
        return None
    
    return await auth_service.validate_token(credentials.credentials)
