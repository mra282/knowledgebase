from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import math
from datetime import datetime

from app.database import get_db
from app.models import Article, UserPermissions
from app.schemas import (
    ArticleCreate, ArticleUpdate, ArticleResponse, ArticleList, 
    SearchResult, HealthCheck, UserInfo, UserPermissionsResponse, UsersList,
    AdminDashboardStats, UserPermissionsUpdate, UserRole, LoginRequest, LoginResponse, RegisterRequest,
    ArticleImportRequest, ArticleImportResponse, DatabaseWipeResponse,
    PlatformResponse, ProductResponse, ArticleVersionResponse
)
from app import crud
from app.search import get_search_service, get_rag_service, SearchService, RAGService
from app.auth import get_current_user_optional, get_current_user_with_permissions, create_local_admin_token

# Create FastAPI application
app = FastAPI(
    title="Knowledge-Centered Support API",
    description="RESTful API for Knowledge Base management following KCS methodology",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc"  # ReDoc
)

# Configure CORS - Allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create database tables on startup
@app.on_event("startup")
def startup_event():
    """Initialize database tables and services"""
    from app.database import create_tables, seed_sample_data
    create_tables()
    seed_sample_data()
    print("✅ Database tables created successfully")
    print("✅ Knowledge-Centered Support API is ready")

# Health check endpoint
@app.get("/health", response_model=HealthCheck)
def health_check(db: Session = Depends(get_db)):
    """Check API and database health"""
    try:
        # Test database connection
        result = db.execute(text("SELECT 1")).fetchone()
        db_connected = result is not None
    except Exception as e:
        print(f"Health check database error: {e}")
        db_connected = False
    
    return HealthCheck(
        status="healthy" if db_connected else "unhealthy",
        timestamp=datetime.now(),
        database_connected=db_connected
    )

# Article CRUD endpoints
@app.get("/articles", response_model=ArticleList)
def get_articles(
    skip: int = Query(0, ge=0, description="Number of articles to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of articles to return"),
    sort_by: str = Query("updated_at", description="Sort field (updated_at, created_at, weight_score)"),
    order: str = Query("desc", description="Sort order (asc, desc)"),
    db: Session = Depends(get_db),
    current_user: Optional[UserInfo] = Depends(get_current_user_optional)
):
    """Get paginated list of articles with sorting options. Public articles visible to all, private articles require authentication."""
    # If user is authenticated, show all articles; if not, show only public articles
    public_only = current_user is None
    articles, total = crud.get_articles(db, skip=skip, limit=limit, sort_by=sort_by, order=order, public_only=public_only)
    
    total_pages = math.ceil(total / limit) if total > 0 else 0
    current_page = (skip // limit) + 1
    
    return ArticleList(
        articles=[ArticleResponse.from_orm(article) for article in articles],
        total=total,
        page=current_page,
        per_page=limit,
        total_pages=total_pages
    )

@app.get("/articles/{article_id}", response_model=ArticleResponse)
def get_article(article_id: int, no_count: bool = False, db: Session = Depends(get_db)):
    """Get a specific article by ID"""
    db_article = crud.get_article(db, article_id=article_id)
    if db_article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    
    # Increment view count for analytics only if not suppressed
    if not no_count:
        crud.increment_view_count(db, article_id)
    
    return ArticleResponse.from_orm(db_article)

@app.post("/articles", response_model=ArticleResponse, status_code=201)
def create_article(article: ArticleCreate, db: Session = Depends(get_db)):
    """Create a new knowledge base article"""
    db_article = crud.create_article(db=db, article=article)
    # Optional: set initial associations
    try:
        if getattr(article, "platform_ids", None):
            crud.set_article_platforms(db, db_article.id, article.platform_ids)
        if getattr(article, "product_ids", None):
            crud.set_article_products(db, db_article.id, article.product_ids)
    except Exception:
        # Associations are optional; ignore errors to not block article creation
        pass
    return ArticleResponse.from_orm(db_article)

@app.put("/articles/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: int, 
    article_update: ArticleUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing article"""
    db_article = crud.update_article(db, article_id=article_id, article_update=article_update)
    if db_article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    
    # Optional: update associations if provided
    update_data = article_update.dict(exclude_unset=True)
    try:
        if "platform_ids" in update_data:
            crud.set_article_platforms(db, article_id, update_data.get("platform_ids") or [])
        if "product_ids" in update_data:
            crud.set_article_products(db, article_id, update_data.get("product_ids") or [])
    except Exception:
        pass
    return ArticleResponse.from_orm(db_article)

@app.delete("/articles/{article_id}", status_code=204)
def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Soft delete an article"""
    success = crud.delete_article(db, article_id=article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")

# Public: list published versions
@app.get("/articles/{article_id}/versions", response_model=List[ArticleVersionResponse])
def list_article_versions_public(article_id: int, db: Session = Depends(get_db)):
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    versions = [v for v in crud.list_article_versions(db, article_id) if not v.is_draft]
    return versions

# Search endpoints
@app.get("/search", response_model=SearchResult)
def search_articles(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=50, description="Number of results to return"),
    enhanced: bool = Query(False, description="Use enhanced search with metadata"),
    db: Session = Depends(get_db),
    search_service: SearchService = Depends(get_search_service),
    current_user: Optional[UserInfo] = Depends(get_current_user_optional)
):
    """
    Search knowledge base articles.
    
    - **q**: Search query string
    - **limit**: Maximum number of results (1-50)
    - **enhanced**: Enable enhanced search features
    
    Returns only public articles for non-authenticated users,
    both public and private articles for authenticated users.
    """
    # Determine if user is authenticated
    public_only = current_user is None
    
    if enhanced:
        articles, search_time, metadata = search_service.enhanced_search(db, q, limit, public_only=public_only)
    else:
        articles, search_time = search_service.basic_search(db, q, limit, public_only=public_only)
        metadata = {}
    
    return SearchResult(
        articles=[ArticleResponse.from_orm(article) for article in articles],
        query=q,
        total_results=len(articles),
        search_time_ms=search_time
    )

# Future RAG endpoint (placeholder)
@app.post("/ask")
async def ask_question(
    query: str = Query(..., description="Natural language question"),
    db: Session = Depends(get_db),
    search_service: SearchService = Depends(get_search_service),
    rag_service: RAGService = Depends(get_rag_service)
):
    """
    Ask a natural language question (RAG integration placeholder).
    
    This endpoint will eventually provide AI-generated answers
    based on the knowledge base content.
    """
    # First, search for relevant articles
    articles, search_time = search_service.basic_search(db, query, limit=5)
    
    # Generate AI answer (placeholder)
    rag_response = await rag_service.generate_answer(query, articles)
    
    return {
        "question": query,
        "answer": rag_response["answer"],
        "confidence": rag_response["confidence"],
        "sources": [
            ArticleResponse.from_orm(article) for article in articles
        ],
        "search_time_ms": search_time,
        "rag_enabled": rag_response["enabled"]
    }

# Analytics endpoints
@app.post("/articles/{article_id}/helpful", status_code=200)
def vote_helpful(article_id: int, db: Session = Depends(get_db)):
    """Mark an article as helpful (affects weight score)"""
    success = crud.vote_helpful(db, article_id=article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")
    
    # Return updated article data
    article = crud.get_article(db, article_id)
    if article:
        return {
            "message": "Helpful vote recorded",
            "helpful_votes": article.helpful_votes,
            "weight_score": article.weight_score
        }
    return {"message": "Vote recorded successfully"}

# Public taxonomy endpoints
@app.get("/platforms", response_model=List[PlatformResponse])
def list_platforms(include_inactive: bool = False, db: Session = Depends(get_db)):
    """List platforms (active by default)."""
    return crud.get_platforms(db, include_inactive=include_inactive)


@app.get("/products", response_model=List[ProductResponse])
def list_products(include_inactive: bool = False, db: Session = Depends(get_db)):
    """List products (active by default)."""
    return crud.get_products(db, include_inactive=include_inactive)

@app.post("/articles/{article_id}/unhelpful", status_code=200) 
def vote_unhelpful(article_id: int, db: Session = Depends(get_db)):
    """Mark an article as unhelpful (affects weight score negatively)"""
    success = crud.vote_unhelpful(db, article_id=article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")
    
    # Return updated article data
    article = crud.get_article(db, article_id)
    if article:
        return {
            "message": "Unhelpful vote recorded", 
            "unhelpful_votes": getattr(article, 'unhelpful_votes', 0),
            "weight_score": article.weight_score
        }
    return {"message": "Vote recorded successfully"}

# =====================================================
# ADMIN DASHBOARD ENDPOINTS
# =====================================================

@app.get("/admin/dashboard", response_model=AdminDashboardStats)
async def get_admin_dashboard_stats(
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics (admin/moderator only)"""
    # Allow admins/moderators outright; otherwise require permission
    if not (current_user.user_role in ["admin", "moderator"] or current_user.has_permission("view_analytics")):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    from sqlalchemy import func, and_
    from datetime import datetime, timedelta
    
    # Get article statistics
    total_articles = db.query(Article).filter(Article.is_active == True).count()
    public_articles = db.query(Article).filter(
        and_(Article.is_active == True, Article.is_public == True)
    ).count()
    private_articles = total_articles - public_articles
    
    # Get user statistics
    total_users = db.query(UserPermissions).filter(UserPermissions.is_active == True).count()
    active_users = total_users  # For now, all users are considered active
    
    # Get today's activity
    today = datetime.now().date()
    articles_created_today = db.query(Article).filter(
        and_(
            Article.is_active == True,
            func.date(Article.created_at) == today
        )
    ).count()
    
    articles_updated_today = db.query(Article).filter(
        and_(
            Article.is_active == True,
            func.date(Article.updated_at) == today
        )
    ).count()
    
    # Get top articles by views
    top_articles = db.query(Article).filter(Article.is_active == True).order_by(
        Article.view_count.desc()
    ).limit(5).all()
    
    # Get recent user activity
    recent_users = db.query(UserPermissions).filter(
        UserPermissions.is_active == True
    ).order_by(UserPermissions.updated_at.desc()).limit(5).all()
    
    return AdminDashboardStats(
        total_articles=total_articles,
        public_articles=public_articles,
        private_articles=private_articles,
        total_users=total_users,
        active_users=active_users,
        articles_created_today=articles_created_today,
        articles_updated_today=articles_updated_today,
        top_articles_by_views=top_articles,
        recent_user_activity=recent_users
    )

@app.get("/admin/users", response_model=UsersList)
async def get_all_users(
    skip: int = Query(0, ge=0, description="Number of users to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of users to return"),
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """Get all users (admin/moderator only)"""
    if not (
        current_user.user_role == "admin"
        or current_user.has_permission("manage_users")
        or current_user.has_permission("view_analytics")
    ):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    users, total = crud.get_all_users(db, skip=skip, limit=limit)
    total_pages = math.ceil(total / limit) if total > 0 else 1
    
    return UsersList(
        users=users,
        total=total,
        page=(skip // limit) + 1,
        per_page=limit,
        total_pages=total_pages
    )

@app.get("/admin/users/{user_id}", response_model=UserPermissionsResponse)
async def get_user_by_id(
    user_id: str,
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """Get specific user details (admin/moderator only)"""
    if not (
        current_user.user_role == "admin"
        or current_user.has_permission("manage_users")
        or current_user.has_permission("view_analytics")
    ):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    user_perms = crud.get_user_permissions(db, user_id)
    if not user_perms:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user_perms

@app.put("/admin/users/{user_id}", response_model=UserPermissionsResponse)
async def update_user_permissions(
    user_id: str,
    user_update: UserPermissionsUpdate,
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """Update user permissions (admin only)"""
    if not (current_user.user_role == "admin" or current_user.has_permission("manage_users")):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Check if user exists
    user_perms = crud.get_user_permissions(db, user_id)
    if not user_perms:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent self-modification of admin privileges
    if user_id == str(current_user.id) and user_update.role and user_update.role != user_perms.role:
        raise HTTPException(status_code=400, detail="Cannot modify your own role")
    
    # Update role if provided
    if user_update.role:
        success = crud.update_user_role(db, user_id, user_update.role)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update user role")
    
    # Update specific permissions
    permissions_to_update = {}
    for field in ['can_view_private', 'can_create_articles', 'can_edit_articles', 
                  'can_delete_articles', 'can_manage_users', 'can_view_analytics']:
        value = getattr(user_update, field, None)
        if value is not None:
            permissions_to_update[field] = value
    
    if permissions_to_update:
        success = crud.update_user_permissions(db, user_id, permissions_to_update)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update user permissions")
    
    # Update user info
    if user_update.username or user_update.email:
        crud.create_or_update_user_permissions(
            db, user_id, 
            username=user_update.username,
            email=user_update.email
        )
    
    # Get updated user
    updated_user = crud.get_user_permissions(db, user_id)
    return updated_user

@app.delete("/admin/users/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """Deactivate a user (admin only)"""
    if not (current_user.user_role == "admin" or current_user.has_permission("manage_users")):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Prevent self-deletion
    if user_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    
    success = crud.deactivate_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deactivated successfully"}

@app.get("/auth/permissions", response_model=UserPermissionsResponse)
async def get_current_user_permissions(
    current_user = Depends(get_current_user_with_permissions)
):
    """Get current user's permissions"""
    return current_user.permissions

# Auth proxy endpoints
@app.post("/auth/login", response_model=LoginResponse)
async def login(login_request: LoginRequest, db: Session = Depends(get_db)):
    """Login handler: supports local admin or proxies to external auth service."""
    import httpx
    import os
    
    def _merge_user_with_permissions(user_dict: dict):
        """Merge external/local user info with local permissions and role."""
        user_id_str = str(user_dict.get("id"))
        is_local_admin = user_dict.get("id") == 0
        # Fetch or create permissions
        perms = crud.get_user_permissions(db, user_id_str)
        if not perms:
            default_role = UserRole.ADMIN if is_local_admin else UserRole.VIEWER
            perms = crud.create_or_update_user_permissions(
                db,
                user_id=user_id_str,
                username=user_dict.get("username"),
                email=user_dict.get("email"),
                role=default_role,
            )
        else:
            # Ensure local admin stays admin
            if is_local_admin and perms.role != UserRole.ADMIN:
                crud.update_user_role(db, user_id_str, UserRole.ADMIN)
                perms = crud.get_user_permissions(db, user_id_str)
            # Update username/email and last_login
            crud.create_or_update_user_permissions(
                db,
                user_id=user_id_str,
                username=user_dict.get("username"),
                email=user_dict.get("email"),
            )

        merged = {
            "id": user_dict.get("id"),
            "username": user_dict.get("username"),
            "email": user_dict.get("email"),
            "full_name": user_dict.get("full_name"),
            "disabled": bool(user_dict.get("disabled", False)),
            "role": perms.role.value,
            "user_role": perms.role.value,  # keep both for compatibility
            "permissions": {
                'can_view_private': perms.can_view_private,
                'can_create_articles': perms.can_create_articles,
                'can_edit_articles': perms.can_edit_articles,
                'can_delete_articles': perms.can_delete_articles,
                'can_manage_users': perms.can_manage_users,
                'can_view_analytics': perms.can_view_analytics,
            }
        }
        return merged

    # 1) Check local admin credentials first
    admin_username = os.getenv("admin_username") or os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("admin_password") or os.getenv("ADMIN_PASSWORD")
    if admin_username and admin_password and \
       login_request.username == admin_username and login_request.password == admin_password:
        token = create_local_admin_token()
        base_user = {
            "id": 0,
            "username": admin_username,
            "email": None,
            "full_name": "Administrator",
            "disabled": False,
        }
        merged_user = _merge_user_with_permissions(base_user)
        return LoginResponse(access_token=token, token_type="bearer", user=merged_user)

    # 2) Fallback to external auth service
    auth_service_url = os.getenv("AUTH_SERVICE_URL", "http://192.168.1.117:8000")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{auth_service_url}/token",
                data={
                    "username": login_request.username,
                    "password": login_request.password,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code == 200:
                auth_data = response.json()

                # Get user info
                user_response = await client.get(
                    f"{auth_service_url}/users/me",
                    headers={"Authorization": f"Bearer {auth_data['access_token']}"},
                )

                if user_response.status_code == 200:
                    user_data = user_response.json()
                    merged_user = _merge_user_with_permissions(user_data)
                    return LoginResponse(
                        access_token=auth_data["access_token"],
                        token_type="bearer",
                        user=merged_user,
                    )
                else:
                    raise HTTPException(status_code=401, detail="Failed to get user information")
            else:
                raise HTTPException(status_code=401, detail="Invalid credentials")

    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")

@app.post("/auth/register")
async def register(register_request: RegisterRequest):
    """Proxy registration request to external auth service"""
    import httpx
    import os
    
    auth_service_url = os.getenv("AUTH_SERVICE_URL", "http://192.168.1.117:8000")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{auth_service_url}/users",
                json={
                    "username": register_request.username,
                    "email": register_request.email,
                    "password": register_request.password,
                    "full_name": register_request.full_name
                }
            )
            
            if response.status_code in [200, 201]:
                return response.json()
            else:
                error_detail = response.text
                raise HTTPException(status_code=response.status_code, detail=error_detail)
                
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")

@app.get("/auth/me")
async def get_current_user_info(current_user = Depends(get_current_user_with_permissions)):
    """Get current user information with merged permissions and role"""
    # Build a merged dict aligning with login response
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "disabled": current_user.disabled,
        "role": current_user.user_role,
        "user_role": current_user.user_role,
        "permissions": current_user.permissions,
    }

@app.get("/")
def root():
    """API root endpoint with basic information"""
    return {
        "message": "Knowledge-Centered Support API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "articles": "/articles",
            "search": "/search",
            "ask": "/ask (RAG placeholder)",
            "admin": "/admin (authentication required)",
            "auth": {
                "login": "/auth/login",
                "register": "/auth/register",
                "me": "/auth/me"
            }
        }
    }

# =====================================================
# ADMIN ONLY ENDPOINTS
# =====================================================

@app.post("/admin/database/wipe", response_model=DatabaseWipeResponse)
async def wipe_database(
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """
    Wipe all articles from the database (admin only).
    This is a destructive operation that cannot be undone.
    """
    # Ensure user is admin
    if current_user.user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get current count before deletion
    article_count = db.query(Article).count()
    
    success = crud.wipe_all_articles(db)
    
    if success:
        return DatabaseWipeResponse(
            success=True,
            message=f"Successfully wiped {article_count} articles from database",
            articles_deleted=article_count
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to wipe database")

@app.post("/admin/articles/import", response_model=ArticleImportResponse)
async def import_articles(
    import_request: ArticleImportRequest,
    current_user = Depends(get_current_user_with_permissions),
    db: Session = Depends(get_db)
):
    """
    Import articles from JSON data (admin only).
    """
    # Ensure user is admin
    if current_user.user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Convert Pydantic models to dictionaries
    articles_data = [article.dict() for article in import_request.articles]
    
    imported_count, failed_count, error_messages = crud.import_articles_from_json(db, articles_data)
    total_count = len(articles_data)
    
    return ArticleImportResponse(
        imported_count=imported_count,
        failed_count=failed_count,
        total_count=total_count,
        error_messages=error_messages,
        success=failed_count == 0
    )

# Include admin router
from app.admin import router as admin_router
app.include_router(admin_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
