from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
from enum import Enum

# Auth schemas
class LoginRequest(BaseModel):
    """Login request schema"""
    username: str
    password: str

class LoginResponse(BaseModel):
    """Login response schema"""
    access_token: str
    token_type: str = "bearer"
    user: dict

class RegisterRequest(BaseModel):
    """Registration request schema"""
    username: str
    email: str
    password: str
    full_name: Optional[str] = None

class UserRole(str, Enum):
    """User roles enum for API"""
    VIEWER = "viewer"
    EDITOR = "editor"
    MODERATOR = "moderator"
    ADMIN = "admin"

class FieldType(str, Enum):
    """Dynamic field types enum for API"""
    TEXT = "text"
    TEXTAREA = "textarea"
    SELECT = "select"
    MULTISELECT = "multiselect"
    CHECKBOX = "checkbox"
    NUMBER = "number"
    DATE = "date"
    EMAIL = "email"
    URL = "url"

class ArticleBase(BaseModel):
    """Base article schema with common fields"""
    title: str = Field(..., min_length=1, max_length=255, description="Article title")
    content: str = Field(..., min_length=1, description="Article content")
    tags: Optional[List[str]] = Field(default_factory=list, description="List of tags")
    weight_score: Optional[float] = Field(default=1.0, ge=0.0, le=10.0, description="KCS weight score (0-10)")
    is_public: Optional[bool] = Field(default=True, description="Whether article is publicly viewable")

class ArticleCreate(ArticleBase):
    """Schema for creating new articles"""
    # Optional initial associations (IDs)
    platform_ids: Optional[List[int]] = None
    product_ids: Optional[List[int]] = None

class ArticleUpdate(BaseModel):
    """Schema for updating existing articles (all fields optional)"""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    tags: Optional[List[str]] = None
    weight_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    platform_ids: Optional[List[int]] = None
    product_ids: Optional[List[int]] = None

class ArticleInDB(ArticleBase):
    """Schema for articles as stored in database"""
    id: int
    is_active: bool
    is_public: bool
    created_at: datetime
    updated_at: datetime
    view_count: int
    helpful_votes: int
    unhelpful_votes: int = 0

    class Config:
        from_attributes = True

class ArticleResponse(ArticleInDB):
    """Schema for API responses"""
    pass

class ArticleList(BaseModel):
    """Schema for paginated article lists"""
    articles: List[ArticleResponse]
    total: int
    page: int
    per_page: int
    total_pages: int

class SearchResult(BaseModel):
    """Schema for search results"""
    articles: List[ArticleResponse]
    query: str
    total_results: int
    search_time_ms: float

# ===============
# Taxonomy Schemas
# ===============

class PlatformBase(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True

class PlatformCreate(PlatformBase):
    pass

class PlatformUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class PlatformResponse(PlatformBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ArticlePlatformSet(BaseModel):
    platform_ids: List[int] = []

class ArticleProductSet(BaseModel):
    product_ids: List[int] = []

class HealthCheck(BaseModel):
    """Schema for health check endpoint"""
    status: str
    timestamp: datetime
    database_connected: bool

class UserInfo(BaseModel):
    """User information from authentication service"""
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    disabled: bool = False

# User Permission Schemas

class UserPermissionsBase(BaseModel):
    """Base user permissions schema"""
    role: UserRole = UserRole.VIEWER
    can_view_private: bool = True
    can_create_articles: bool = False
    can_edit_articles: bool = False
    can_delete_articles: bool = False
    can_manage_users: bool = False
    can_view_analytics: bool = False

class UserPermissionsCreate(UserPermissionsBase):
    """Schema for creating user permissions"""
    user_id: str = Field(..., description="External auth service user ID")
    username: Optional[str] = None
    email: Optional[str] = None

class UserPermissionsUpdate(BaseModel):
    """Schema for updating user permissions"""
    role: Optional[UserRole] = None
    username: Optional[str] = None
    email: Optional[str] = None
    can_view_private: Optional[bool] = None
    can_create_articles: Optional[bool] = None
    can_edit_articles: Optional[bool] = None
    can_delete_articles: Optional[bool] = None
    can_manage_users: Optional[bool] = None
    can_view_analytics: Optional[bool] = None
    is_active: Optional[bool] = None

class UserPermissionsInDB(UserPermissionsBase):
    """Schema for user permissions as stored in database"""
    id: int
    user_id: str
    username: Optional[str]
    email: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True

class UserPermissionsResponse(UserPermissionsInDB):
    """Schema for user permissions API responses"""
    pass

class UsersList(BaseModel):
    """Schema for paginated user lists"""
    users: List[UserPermissionsResponse]
    total: int
    page: int
    per_page: int
    total_pages: int

class AdminDashboardStats(BaseModel):
    """Schema for admin dashboard statistics"""
    total_articles: int
    public_articles: int
    private_articles: int
    total_users: int
    active_users: int
    articles_created_today: int
    articles_updated_today: int
    top_articles_by_views: List[ArticleResponse]
    recent_user_activity: List[UserPermissionsResponse]

class ArticleImportData(BaseModel):
    """Schema for importing article data"""
    title: str
    content: str
    tags: Optional[List[str]] = []
    weight_score: Optional[float] = 5.0
    is_public: Optional[bool] = True
    is_active: Optional[bool] = True
    view_count: Optional[int] = 0
    helpful_votes: Optional[int] = 0

class ArticleImportRequest(BaseModel):
    """Schema for article import request"""
    articles: List[ArticleImportData]

class ArticleImportResponse(BaseModel):
    """Schema for article import response"""
    imported_count: int
    failed_count: int
    total_count: int
    error_messages: List[str]
    success: bool

class DatabaseWipeResponse(BaseModel):
    """Schema for database wipe response"""
    success: bool
    message: str


# Dynamic Field Schemas
class DynamicFieldOptionBase(BaseModel):
    """Base schema for dynamic field options"""
    value: str
    label: str
    sort_order: int = 0
    is_active: bool = True

class DynamicFieldOptionCreate(DynamicFieldOptionBase):
    """Schema for creating dynamic field options"""
    pass

class DynamicFieldOptionResponse(DynamicFieldOptionBase):
    """Schema for dynamic field option responses"""
    id: int
    field_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class DynamicFieldBase(BaseModel):
    """Base schema for dynamic fields"""
    name: str = Field(..., description="Field name (used in API)")
    label: str = Field(..., description="Display label")
    field_type: FieldType
    is_required: bool = False
    is_active: bool = True
    sort_order: int = 0
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    validation_rules: Optional[Dict[str, Any]] = None

class DynamicFieldCreate(DynamicFieldBase):
    """Schema for creating dynamic fields"""
    options: Optional[List[DynamicFieldOptionCreate]] = []

class DynamicFieldUpdate(BaseModel):
    """Schema for updating dynamic fields"""
    label: Optional[str] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    validation_rules: Optional[Dict[str, Any]] = None
    options: Optional[List[DynamicFieldOptionCreate]] = None

class DynamicFieldResponse(DynamicFieldBase):
    """Schema for dynamic field responses"""
    id: int
    created_at: datetime
    updated_at: datetime
    options: List[DynamicFieldOptionResponse] = []

    class Config:
        from_attributes = True

class ArticleFieldValueBase(BaseModel):
    """Base schema for article field values"""
    field_id: int
    value: Optional[str] = None

class ArticleFieldValueCreate(ArticleFieldValueBase):
    """Schema for creating article field values"""
    pass

class ArticleFieldValueResponse(ArticleFieldValueBase):
    """Schema for article field value responses"""
    id: int
    article_id: int
    field: DynamicFieldResponse
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    articles_deleted: Optional[int] = None
