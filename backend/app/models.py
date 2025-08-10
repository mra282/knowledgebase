from sqlalchemy import Boolean, Column, Float, Integer, String, Text, DateTime, JSON, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

Base = declarative_base()

class UserRole(enum.Enum):
    """User roles with different permission levels"""
    VIEWER = "viewer"           # Can view all articles
    EDITOR = "editor"           # Can create and edit articles  
    MODERATOR = "moderator"     # Can manage articles and users
    ADMIN = "admin"             # Full system access

class FieldType(enum.Enum):
    """Types of dynamic fields that can be added to articles"""
    TEXT = "text"               # Single line text input
    TEXTAREA = "textarea"       # Multi-line text input
    SELECT = "select"           # Dropdown menu (single selection)
    MULTISELECT = "multiselect" # Multiple selection dropdown
    CHECKBOX = "checkbox"       # Boolean checkbox
    NUMBER = "number"           # Numeric input
    DATE = "date"              # Date picker
    EMAIL = "email"            # Email input
    URL = "url"                # URL input

class UserPermissions(Base):
    """
    User permissions and roles for the knowledge base.
    Links external auth service user IDs to internal permissions.
    """
    __tablename__ = "user_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), unique=True, index=True, nullable=False)  # External auth service user ID
    username = Column(String(255), index=True)  # Optional cached username
    email = Column(String(255), index=True)     # Optional cached email
    # Store enum values (lowercase strings) in DB using native enum 'userrole'
    role = Column(
        Enum(
            UserRole,
            name="userrole",
            values_callable=lambda x: [e.value for e in x],  # use enum values (lowercase)
            native_enum=True,
            validate_strings=True,
        ),
        default=UserRole.VIEWER,
        nullable=False,
    )
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # Permission flags for granular control
    can_view_private = Column(Boolean, default=True)    # Can view private articles
    can_create_articles = Column(Boolean, default=False) # Can create new articles
    can_edit_articles = Column(Boolean, default=False)   # Can edit existing articles
    can_delete_articles = Column(Boolean, default=False) # Can delete articles
    can_manage_users = Column(Boolean, default=False)    # Can manage other users
    can_view_analytics = Column(Boolean, default=False)  # Can view system analytics
    
    def __repr__(self):
        return f"<UserPermissions(user_id='{self.user_id}', role='{self.role}', username='{self.username}')>"
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission"""
        return getattr(self, f"can_{permission}", False)
    
    def is_admin_or_moderator(self) -> bool:
        """Check if user has admin or moderator privileges"""
        return self.role in [UserRole.ADMIN, UserRole.MODERATOR]

class Article(Base):
    """
    Knowledge Base Article model following KCS methodology.
    
    - id: Unique identifier
    - title: Article title (should be descriptive for search)
    - content: Main article content (supports rich text/markdown)
    - tags: JSON array of tags for categorization
    - weight_score: KCS weight score (higher = more valuable/trusted)
    - is_active: Soft delete flag
    - created_at: Timestamp for article creation
    - updated_at: Timestamp for last modification
    - view_count: Number of times article was accessed
    - helpful_votes: Number of positive feedback votes
    """
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=list)  # Store as JSON array
    weight_score = Column(Float, default=1.0, index=True)  # KCS weighting
    is_active = Column(Boolean, default=True, index=True)
    is_public = Column(Boolean, default=True, index=True)  # Public articles don't require auth
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    view_count = Column(Integer, default=0)
    helpful_votes = Column(Integer, default=0)
    unhelpful_votes = Column(Integer, default=0)

    def __repr__(self):
        return f"<Article(id={self.id}, title='{self.title}', weight_score={self.weight_score})>"

    # Associations (defined after related classes)



class DynamicField(Base):
    """
    Dynamic field definitions that can be added to articles.
    Admins can create custom fields through the admin interface.
    """
    __tablename__ = "dynamic_fields"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)  # Field name (for API)
    label = Column(String(255), nullable=False)  # Display label
    field_type = Column(Enum(FieldType), nullable=False)
    is_required = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, index=True)
    sort_order = Column(Integer, default=0)  # Display order
    placeholder = Column(String(255))  # Placeholder text
    help_text = Column(Text)  # Help text for users
    validation_rules = Column(JSON)  # JSON object with validation rules
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship to field options
    options = relationship("DynamicFieldOption", back_populates="field", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DynamicField(id={self.id}, name='{self.name}', type='{self.field_type}')>"


class DynamicFieldOption(Base):
    """
    Options for select/multiselect dynamic fields.
    Each option represents a choice in a dropdown menu.
    """
    __tablename__ = "dynamic_field_options"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("dynamic_fields.id"), nullable=False)
    value = Column(String(255), nullable=False)  # Option value (for API)
    label = Column(String(255), nullable=False)  # Display label
    sort_order = Column(Integer, default=0)  # Display order
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to field
    field = relationship("DynamicField", back_populates="options")
    
    def __repr__(self):
        return f"<DynamicFieldOption(id={self.id}, field_id={self.field_id}, value='{self.value}')>"


class ArticleFieldValue(Base):
    """
    Values of dynamic fields for specific articles.
    This stores the actual data entered for each dynamic field on each article.
    """
    __tablename__ = "article_field_values"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=False)
    field_id = Column(Integer, ForeignKey("dynamic_fields.id"), nullable=False)
    value = Column(Text)  # Store all values as text, convert as needed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    article = relationship("Article")
    field = relationship("DynamicField")
    
    def __repr__(self):
        return f"<ArticleFieldValue(id={self.id}, article_id={self.article_id}, field_id={self.field_id})>"


# =========================
# Platform/Product Entities
# =========================

class Platform(Base):
    """Gaming platform (e.g., Xbox, PS5)."""
    __tablename__ = "platforms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=True)
    description = Column(Text)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship to articles via association
    articles = relationship("ArticlePlatform", back_populates="platform", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Platform(id={self.id}, name='{self.name}')>"


class Product(Base):
    """Game/software product name."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=True)
    description = Column(Text)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship to articles via association
    articles = relationship("ArticleProduct", back_populates="product", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Product(id={self.id}, name='{self.name}')>"


# ==================
# Article Versioning
# ==================

class ArticleVersion(Base):
    """
    Snapshot of an article at a point in time.

    - version_number: monotonically increasing per article
    - is_draft: if True, not currently live
    - published_at: timestamp when this version was published (if any)
    """
    __tablename__ = "article_versions"
    __table_args__ = (
        UniqueConstraint("article_id", "version_number", name="uq_article_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    weight_score = Column(Float, default=1.0)
    is_public = Column(Boolean, default=True)
    is_draft = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)

    # Relationship back to article
    article = relationship("Article", backref="versions")

    def __repr__(self):
        return f"<ArticleVersion(id={self.id}, article_id={self.article_id}, v={self.version_number}, draft={self.is_draft})>"


class ArticlePlatform(Base):
    """Association between Article and Platform (many-to-many)."""
    __tablename__ = "article_platforms"
    __table_args__ = (
        UniqueConstraint("article_id", "platform_id", name="uq_article_platform"),
    )

    id = Column(Integer, primary_key=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    platform_id = Column(Integer, ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    article = relationship("Article", backref="article_platforms")
    platform = relationship("Platform", back_populates="articles")


class ArticleProduct(Base):
    """Association between Article and Product (many-to-many)."""
    __tablename__ = "article_products"
    __table_args__ = (
        UniqueConstraint("article_id", "product_id", name="uq_article_product"),
    )

    id = Column(Integer, primary_key=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    article = relationship("Article", backref="article_products")
    product = relationship("Product", back_populates="articles")
