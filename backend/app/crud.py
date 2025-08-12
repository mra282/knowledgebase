from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, not_, desc, func, String, text, exists
from typing import List, Optional, Dict
from app.models import (
    Article,
    UserPermissions,
    UserRole,
    DynamicField,
    DynamicFieldOption,
    ArticleFieldValue,
    FieldType,
    Platform,
    Product,
    ArticlePlatform,
    ArticleProduct,
    ArticleVersion,
    Language,
    TranslationGroup,
    ArticleTranslation,
)
from app.schemas import (
    ArticleCreate,
    ArticleUpdate,
    DynamicFieldCreate,
    DynamicFieldUpdate,
    DynamicFieldOptionCreate,
    ArticleFieldValueCreate,
    LanguageCreate,
    LanguageUpdate,
)
from datetime import datetime
import time
import os
import httpx

def get_article(db: Session, article_id: int) -> Optional[Article]:
    """Get a single article by ID"""
    return db.query(Article).filter(
        and_(Article.id == article_id, Article.is_active == True)
    ).first()

def get_articles(
    db: Session, 
    skip: int = 0, 
    limit: int = 20, 
    sort_by: str = "updated_at",
    order: str = "desc",
    public_only: bool = False
) -> tuple[List[Article], int]:
    """
    Get paginated list of articles, sorted by specified field.
    Returns (articles, total_count) tuple.
    If public_only=True, only returns public articles.
    """
    query = db.query(Article).filter(Article.is_active == True)
    
    # Filter by public status if not authenticated
    if public_only:
        query = query.filter(Article.is_public == True)
    
    # Apply sorting
    if sort_by == "weight_score":
        if order == "desc":
            query = query.order_by(desc(Article.weight_score))
        else:
            query = query.order_by(Article.weight_score)
    elif sort_by == "created_at":
        if order == "desc":
            query = query.order_by(desc(Article.created_at))
        else:
            query = query.order_by(Article.created_at)
    else:  # Default to updated_at
        if order == "desc":
            query = query.order_by(desc(Article.updated_at))
        else:
            query = query.order_by(Article.updated_at)
    
    total = query.count()
    articles = query.offset(skip).limit(limit).all()
    
    return articles, total

def create_article(db: Session, article: ArticleCreate) -> Article:
    """Create a new article"""
    db_article = Article(
        title=article.title,
        content=article.content,
        tags=article.tags or [],
        weight_score=article.weight_score or 1.0,
        is_public=article.is_public if article.is_public is not None else True
    )
    db.add(db_article)
    db.commit()
    db.refresh(db_article)
    # Create initial version 1 (published)
    _create_article_version(db, db_article, is_draft=False)
    return db_article

def update_article(db: Session, article_id: int, article_update: ArticleUpdate) -> Optional[Article]:
    """Update an existing article"""
    db_article = get_article(db, article_id)
    if db_article is None:
        return None
    
    update_data = article_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_article, field, value)
    
    db.commit()
    db.refresh(db_article)
    # Create a new published version snapshot after update
    _create_article_version(db, db_article, is_draft=False)
    return db_article

# ==================
# Versioning helpers
# ==================

def _next_version_number(db: Session, article_id: int) -> int:
    current = (
        db.query(func.max(ArticleVersion.version_number))
        .filter(ArticleVersion.article_id == article_id)
        .scalar()
    )
    return (current or 0) + 1

def _create_article_version(db: Session, article: Article, is_draft: bool = False) -> ArticleVersion:
    vnum = _next_version_number(db, article.id)
    version = ArticleVersion(
        article_id=article.id,
        version_number=vnum,
        title=article.title,
        content=article.content,
        tags=article.tags or [],
        weight_score=article.weight_score,
        is_public=article.is_public,
        is_draft=is_draft,
    published_at=None if is_draft else datetime.utcnow(),
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version

def list_article_versions(db: Session, article_id: int) -> List[ArticleVersion]:
    return (
        db.query(ArticleVersion)
        .filter(ArticleVersion.article_id == article_id)
        .order_by(desc(ArticleVersion.version_number))
        .all()
    )

def get_article_version(db: Session, article_id: int, version_number: int) -> Optional[ArticleVersion]:
    return (
        db.query(ArticleVersion)
        .filter(ArticleVersion.article_id == article_id, ArticleVersion.version_number == version_number)
        .first()
    )

def rollback_article_to_version(db: Session, article_id: int, version_number: int) -> Optional[Article]:
    art = get_article(db, article_id)
    if not art:
        return None
    ver = get_article_version(db, article_id, version_number)
    if not ver or ver.is_draft:
        return None
    art.title = ver.title
    art.content = ver.content
    art.tags = ver.tags or []
    art.weight_score = ver.weight_score
    art.is_public = ver.is_public
    db.commit()
    db.refresh(art)
    # Snapshot new published version
    _create_article_version(db, art, is_draft=False)
    return art

def create_draft_version(db: Session, article_id: int) -> Optional[ArticleVersion]:
    art = get_article(db, article_id)
    if not art:
        return None
    return _create_article_version(db, art, is_draft=True)

def update_draft_version(db: Session, article_id: int, version_number: int, data: Dict) -> Optional[ArticleVersion]:
    ver = get_article_version(db, article_id, version_number)
    if not ver or not ver.is_draft:
        return None
    for k in ["title", "content", "tags", "weight_score", "is_public"]:
        if k in data and data[k] is not None:
            setattr(ver, k, data[k])
    db.commit()
    db.refresh(ver)
    return ver

def publish_draft_version(db: Session, article_id: int, version_number: int) -> Optional[Article]:
    art = get_article(db, article_id)
    ver = get_article_version(db, article_id, version_number)
    if not art or not ver or not ver.is_draft:
        return None
    # Apply draft to live article
    art.title = ver.title
    art.content = ver.content
    art.tags = ver.tags or []
    art.weight_score = ver.weight_score
    art.is_public = ver.is_public
    db.commit()
    db.refresh(art)
    # Mark draft as published and snapshot a published version
    ver.is_draft = False
    ver.published_at = datetime.utcnow()
    db.commit()
    _create_article_version(db, art, is_draft=False)
    return art

def delete_article(db: Session, article_id: int) -> bool:
    """Soft delete an article"""
    db_article = get_article(db, article_id)
    if db_article is None:
        return False
    
    db_article.is_active = False
    db.commit()
    return True

def _get_json_search_condition(term_pattern: str):
    """
    Get database-agnostic JSON search condition for tags field.
    
    Args:
        term_pattern: The search pattern (e.g., '%passenger%')
        
    Returns:
        SQLAlchemy condition for searching JSON tags
    """
    database_url = os.getenv("DATABASE_URL", "sqlite:///./data/knowledgebase.db")
    
    if database_url.startswith("postgresql"):
        # PostgreSQL: Cast JSONB to text and search
        return func.cast(Article.tags, String).ilike(term_pattern)
    else:
        # SQLite: Use json_extract function
        return func.json_extract(Article.tags, '$').cast(String).ilike(term_pattern)

def _parse_search_query(query: str) -> tuple[list[str], list[str], list[str]]:
    """Parse a query string into (required, excluded, optional) term lists.

    Syntax supported:
    - +term => required term
    - -term => excluded term
    - term  => optional term
    Terms are split on whitespace; punctuation around words is ignored.
    """
    import re
    if not query:
        return [], [], []
    tokens = [t for t in query.strip().split() if t]
    required: list[str] = []
    excluded: list[str] = []
    optional: list[str] = []

    for tok in tokens:
        # Keep prefix then strip non-word chars from term body
        prefix = tok[0]
        body = tok[1:] if prefix in ['+', '-'] else tok
        body = re.sub(r'[^\w\-]+', '', body).strip()  # allow hyphens in tags/words
        if not body:
            continue
        if prefix == '+':
            required.append(body.lower())
        elif prefix == '-':
            excluded.append(body.lower())
        else:
            optional.append(tok.lower())

    return required, excluded, optional


def search_articles(db: Session, query: str, limit: int = 20, public_only: bool = False) -> tuple[List[Article], float]:
    """
    Basic keyword search across title and content.
    Returns (matching_articles, search_time_ms) tuple.
    
    Args:
        db: Database session
        query: Search query string
        limit: Maximum number of results
        public_only: If True, only returns public articles
    
    This is a simple implementation using SQL LIKE queries.
    For production, consider implementing full-text search with:
    - SQLite FTS5 extension
    - Elasticsearch
    - Vector embeddings for semantic search
    """
    start_time = time.time()
    
    if not query.strip():
        articles, _ = get_articles(db, limit=limit, sort_by="weight_score", public_only=public_only)
        search_time = (time.time() - start_time) * 1000
        return articles, search_time
    
    # Parse query into required/excluded/optional terms
    required_terms, excluded_terms, optional_terms = _parse_search_query(query)
    # If no prefixes provided, treat all as optional but require at least one
    if not required_terms and not excluded_terms and not optional_terms:
        articles, _ = get_articles(db, limit=limit, sort_by="weight_score", public_only=public_only)
        search_time = (time.time() - start_time) * 1000
        return articles, search_time
    
    # Build base query with filters
    base_filters = [Article.is_active == True]
    if public_only:
        base_filters.append(Article.is_public == True)

    def _match_condition(term: str):
        pat = f"%{term}%"
        # Correlated EXISTS for platform/product name matches
        platform_exists = exists().where(
            and_(
                ArticlePlatform.article_id == Article.id,
                ArticlePlatform.platform_id == Platform.id,
                Platform.name.ilike(pat),
            )
        )
        product_exists = exists().where(
            and_(
                ArticleProduct.article_id == Article.id,
                ArticleProduct.product_id == Product.id,
                Product.name.ilike(pat),
            )
        )
        return or_(
            Article.title.ilike(pat),
            Article.content.ilike(pat),
            _get_json_search_condition(pat),
            platform_exists,
            product_exists,
        )

    filters = list(base_filters)

    # Required: every required term must match somewhere
    for term in required_terms:
        filters.append(_match_condition(term))

    # Optional: at least one optional term must match if any provided and no required terms
    if optional_terms:
        if required_terms:
            # When required terms exist, optional terms are used for ranking; do not filter.
            pass
        else:
            optional_any = or_(*[_match_condition(t) for t in optional_terms])
            filters.append(optional_any)

    # Excluded: none of the excluded terms may match
    for term in excluded_terms:
        filters.append(not_(_match_condition(term)))

    # Execute search query with weight-based sorting
    articles = (
        db.query(Article)
        .filter(and_(*filters))
        .order_by(desc(Article.weight_score), desc(Article.updated_at))
        .limit(limit)
        .all()
    )
    
    search_time = (time.time() - start_time) * 1000
    return articles, search_time

def increment_view_count(db: Session, article_id: int) -> bool:
    """Increment view count for article analytics"""
    db_article = get_article(db, article_id)
    if db_article is None:
        return False
    
    db_article.view_count += 1
    db.commit()
    return True

# =================
# Article Notes CRUD
# =================

def get_article_notes(db: Session, article_id: int) -> Optional[str]:
    art = get_article(db, article_id)
    if not art:
        return None
    return art.notes

def set_article_notes(db: Session, article_id: int, notes: Optional[str]) -> bool:
    art = get_article(db, article_id)
    if not art:
        return False
    art.notes = notes
    db.commit()
    return True

def vote_helpful(db: Session, article_id: int) -> bool:
    """Increment helpful votes (for future KCS scoring)"""
    db_article = get_article(db, article_id)
    if db_article is None:
        return False
    
    db_article.helpful_votes += 1
    # Simple weight adjustment based on helpful votes
    # In a full KCS implementation, this would be more sophisticated
    db_article.weight_score = min(10.0, db_article.weight_score + 0.1)
    db.commit()
    return True


def vote_unhelpful(db: Session, article_id: int) -> bool:
    """Increment unhelpful votes (negatively affects weight score)"""
    db_article = get_article(db, article_id)
    if db_article is None:
        return False
    
    db_article.unhelpful_votes += 1
    # Decrease weight score for unhelpful votes, but don't go below 0.1
    db_article.weight_score = max(0.1, db_article.weight_score - 0.05)
    db.commit()
    return True

# ======================
# Localization CRUD
# ======================

def get_languages(db: Session, include_inactive: bool = False) -> List[Language]:
    q = db.query(Language)
    if not include_inactive:
        q = q.filter(Language.is_active == True)
    return q.order_by(Language.code).all()

def get_language_by_code(db: Session, code: str) -> Optional[Language]:
    return db.query(Language).filter(Language.code == code).first()

def create_language(db: Session, payload: LanguageCreate) -> Language:
    lang = Language(code=payload.code, name=payload.name, is_active=payload.is_active)
    db.add(lang)
    db.commit()
    db.refresh(lang)
    return lang

def update_language(db: Session, language_id: int, payload: LanguageUpdate) -> Optional[Language]:
    lang = db.query(Language).get(language_id)
    if not lang:
        return None
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(lang, k, v)
    db.commit()
    db.refresh(lang)
    return lang

def delete_language(db: Session, language_id: int) -> bool:
    lang = db.query(Language).get(language_id)
    if not lang:
        return False
    db.delete(lang)
    db.commit()
    return True

def get_article_translation_mapping(db: Session, article_id: int) -> Optional[ArticleTranslation]:
    return db.query(ArticleTranslation).filter(ArticleTranslation.article_id == article_id).first()

def get_sibling_translations(db: Session, article_id: int) -> List[ArticleTranslation]:
    """Return other translations in the same group as the article (exclude itself)."""
    mapping = get_article_translation_mapping(db, article_id)
    if not mapping:
        return []
    return (
        db.query(ArticleTranslation)
        .filter(ArticleTranslation.group_id == mapping.group_id, ArticleTranslation.article_id != article_id)
        .all()
    )

def get_group_translations(db: Session, group_id: int) -> List[ArticleTranslation]:
    return db.query(ArticleTranslation).filter(ArticleTranslation.group_id == group_id).all()

def _get_or_create_group(db: Session, group_id: Optional[int]) -> TranslationGroup:
    if group_id:
        grp = db.query(TranslationGroup).get(group_id)
        if grp:
            return grp
    grp = TranslationGroup()
    db.add(grp)
    db.commit()
    db.refresh(grp)
    return grp

async def _azure_translate(text: str, from_lang: str, to_lang: str) -> str:
    """Translate text using Azure Cognitive Services if configured; else echo text."""
    key = os.getenv("AZURE_TRANSLATE_KEY")
    endpoint = os.getenv("AZURE_TRANSLATE_ENDPOINT")
    region = os.getenv("AZURE_TRANSLATE_REGION")
    if not key or not endpoint:
        return text  # No-op if not configured
    url = f"{endpoint}/translate?api-version=3.0&from={from_lang}&to={to_lang}"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region or "",
        "Content-Type": "application/json",
    }
    body = [{"Text": text}]
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        return data[0]["translations"][0]["text"]

async def attach_article_to_language_group(
    db: Session,
    article_id: int,
    language_code: str,
    group_id: Optional[int] = None,
    auto_translate_from_article_id: Optional[int] = None,
) -> Optional[ArticleTranslation]:
    art = get_article(db, article_id)
    if not art:
        return None
    lang = get_language_by_code(db, language_code)
    if not lang:
        return None
    grp = _get_or_create_group(db, group_id)

    # Ensure uniqueness per article and per (group, language)
    exists_same_article = db.query(ArticleTranslation).filter(ArticleTranslation.article_id == article_id).first()
    if exists_same_article:
        return exists_same_article
    exists_lang_in_group = (
        db.query(ArticleTranslation)
        .filter(ArticleTranslation.group_id == grp.id, ArticleTranslation.language_id == lang.id)
        .first()
    )
    if exists_lang_in_group:
        return None  # language already present in group

    mapping = ArticleTranslation(article_id=article_id, language_id=lang.id, group_id=grp.id)
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    # Optional: auto-translate by creating a draft version with translated content
    if auto_translate_from_article_id:
        src = get_article(db, auto_translate_from_article_id)
        if src:
            from_lang = os.getenv("DEFAULT_SOURCE_LANG", "en")
            try:
                translated_title = await _azure_translate(src.title, from_lang, language_code)
                translated_content = await _azure_translate(src.content, from_lang, language_code)
            except Exception:
                translated_title, translated_content = src.title, src.content
            # Create a draft version for the target article and set translated fields
            draft = _create_article_version(db, art, is_draft=True)
            draft.title = translated_title
            draft.content = translated_content
            db.commit()

    return mapping

# User Permissions CRUD Operations

def get_user_permissions(db: Session, user_id: str) -> Optional[UserPermissions]:
    """Get user permissions by external user ID"""
    return db.query(UserPermissions).filter(
        and_(UserPermissions.user_id == user_id, UserPermissions.is_active == True)
    ).first()

def create_or_update_user_permissions(
    db: Session, 
    user_id: str, 
    username: str = None,
    email: str = None,
    role: UserRole = UserRole.VIEWER
) -> UserPermissions:
    """Create or update user permissions"""
    user_perms = get_user_permissions(db, user_id)
    
    if user_perms:
        # Update existing user
        if username:
            user_perms.username = username
        if email:
            user_perms.email = email
        user_perms.last_login = datetime.utcnow()
    else:
        # Create new user with default permissions based on role
        permissions = _get_default_permissions_for_role(role)
        user_perms = UserPermissions(
            user_id=user_id,
            username=username,
            email=email,
            role=role,
            **permissions
        )
        db.add(user_perms)
    
    db.commit()
    return user_perms

def get_all_users(db: Session, skip: int = 0, limit: int = 50) -> tuple[List[UserPermissions], int]:
    """Get paginated list of all users"""
    query = db.query(UserPermissions).filter(UserPermissions.is_active == True)
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    return users, total

def update_user_role(db: Session, user_id: str, new_role: UserRole) -> bool:
    """Update user role and associated permissions"""
    user_perms = get_user_permissions(db, user_id)
    if not user_perms:
        return False
    
    # Normalize to models.UserRole enum (lowercase values)
    try:
        if isinstance(new_role, str):
            normalized_value = new_role.lower()
        else:
            # Handle enums from other modules by reading .value if present
            normalized_value = getattr(new_role, 'value', str(new_role)).lower()
        role_enum = UserRole(normalized_value)
    except Exception:
        role_enum = UserRole.VIEWER

    user_perms.role = role_enum
    permissions = _get_default_permissions_for_role(role_enum)
    
    for perm_name, perm_value in permissions.items():
        setattr(user_perms, perm_name, perm_value)
    
    db.commit()
    return True

def update_user_permissions(db: Session, user_id: str, permissions: dict) -> bool:
    """Update specific user permissions"""
    user_perms = get_user_permissions(db, user_id)
    if not user_perms:
        return False
    
    # Update only valid permission fields
    valid_perms = [
        'can_view_private', 'can_create_articles', 'can_edit_articles',
        'can_delete_articles', 'can_manage_users', 'can_view_analytics'
    ]
    
    for perm_name, perm_value in permissions.items():
        if perm_name in valid_perms and isinstance(perm_value, bool):
            setattr(user_perms, perm_name, perm_value)
    
    db.commit()
    return True

def deactivate_user(db: Session, user_id: str) -> bool:
    """Deactivate a user (soft delete)"""
    user_perms = get_user_permissions(db, user_id)
    if not user_perms:
        return False
    
    user_perms.is_active = False
    db.commit()
    return True

def _get_default_permissions_for_role(role: UserRole) -> dict:
    """Get default permissions for a given role"""
    if role == UserRole.ADMIN:
        return {
            'can_view_private': True,
            'can_create_articles': True,
            'can_edit_articles': True,
            'can_delete_articles': True,
            'can_manage_users': True,
            'can_view_analytics': True,
        }
    elif role == UserRole.MODERATOR:
        return {
            'can_view_private': True,
            'can_create_articles': True,
            'can_edit_articles': True,
            'can_delete_articles': True,
            'can_manage_users': False,
            'can_view_analytics': True,
        }
    elif role == UserRole.EDITOR:
        return {
            'can_view_private': True,
            'can_create_articles': True,
            'can_edit_articles': True,
            'can_delete_articles': False,
            'can_manage_users': False,
            'can_view_analytics': False,
        }
    else:  # VIEWER
        return {
            'can_view_private': True,
            'can_create_articles': False,
            'can_edit_articles': False,
            'can_delete_articles': False,
            'can_manage_users': False,
            'can_view_analytics': False,
        }

def wipe_all_articles(db: Session) -> bool:
    """
    Admin function: Delete all articles from the database.
    This is a destructive operation that cannot be undone.
    
    Args:
        db: Database session
        
    Returns:
        True if successful
    """
    try:
        # Delete all articles
        deleted_count = db.query(Article).delete()
        db.commit()
        print(f"✅ Wiped {deleted_count} articles from database")
        return True
    except Exception as e:
        db.rollback()
        print(f"❌ Error wiping articles: {e}")
        return False

def import_articles_from_json(db: Session, articles_data: List[dict]) -> tuple[int, int, List[str]]:
    """
    Import articles from JSON data.
    
    Args:
        db: Database session
        articles_data: List of article dictionaries
        
    Returns:
        Tuple of (imported_count, failed_count, error_messages)
    """
    imported_count = 0
    failed_count = 0
    error_messages = []
    
    for i, article_data in enumerate(articles_data):
        try:
            # Validate required fields
            required_fields = ['title', 'content']
            for field in required_fields:
                if field not in article_data or not article_data[field]:
                    raise ValueError(f"Missing required field: {field}")
            
            # Create article with defaults for missing optional fields
            article = Article(
                title=article_data['title'],
                content=article_data['content'],
                tags=article_data.get('tags', []),
                weight_score=article_data.get('weight_score', 5.0),
                is_public=article_data.get('is_public', True),
                is_active=article_data.get('is_active', True),
                view_count=article_data.get('view_count', 0),
                helpful_votes=article_data.get('helpful_votes', 0),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(article)
            imported_count += 1
            
        except Exception as e:
            failed_count += 1
            error_messages.append(f"Article {i+1}: {str(e)}")
    
    try:
        db.commit()
        print(f"✅ Imported {imported_count} articles successfully")
        if failed_count > 0:
            print(f"⚠️ Failed to import {failed_count} articles")
    except Exception as e:
        db.rollback()
        error_messages.append(f"Database commit failed: {str(e)}")
        return 0, len(articles_data), error_messages
    
    return imported_count, failed_count, error_messages

# Dynamic Fields CRUD

def get_dynamic_fields(db: Session, include_inactive: bool = False) -> List[DynamicField]:
    """Get all dynamic fields, optionally including inactive ones"""
    query = db.query(DynamicField)
    if not include_inactive:
        query = query.filter(DynamicField.is_active == True)
    return query.order_by(DynamicField.sort_order, DynamicField.name).all()

def get_dynamic_field(db: Session, field_id: int) -> Optional[DynamicField]:
    """Get a single dynamic field by ID"""
    return db.query(DynamicField).filter(DynamicField.id == field_id).first()

def create_dynamic_field(db: Session, field: DynamicFieldCreate) -> DynamicField:
    """Create a new dynamic field with options"""
    # Convert string field_type to enum if needed
    if isinstance(field.field_type, str):
        field_type = FieldType(field.field_type)
    else:
        field_type = field.field_type
    
    db_field = DynamicField(
        name=field.name,
        label=field.label,
        field_type=field_type,
        is_required=field.is_required,
        is_active=field.is_active,
        sort_order=field.sort_order,
        placeholder=field.placeholder,
        help_text=field.help_text,
        validation_rules=field.validation_rules
    )
    db.add(db_field)
    db.flush()  # Get the ID
    
    # Add options for select/multiselect fields
    if field.options and field.field_type in ["select", "multiselect"]:
        for option_data in field.options:
            db_option = DynamicFieldOption(
                field_id=db_field.id,
                value=option_data.value,
                label=option_data.label,
                sort_order=option_data.sort_order,
                is_active=option_data.is_active
            )
            db.add(db_option)
    
    db.commit()
    
    # Instead of refresh, query it back to avoid enum issues
    return db.query(DynamicField).filter(DynamicField.id == db_field.id).first()

def update_dynamic_field(db: Session, field_id: int, field_update: DynamicFieldUpdate) -> Optional[DynamicField]:
    """Update a dynamic field and its options"""
    db_field = db.query(DynamicField).filter(DynamicField.id == field_id).first()
    if not db_field:
        return None
    
    # Update field properties
    update_data = field_update.dict(exclude_unset=True, exclude={"options"})
    for key, value in update_data.items():
        setattr(db_field, key, value)
    
    # Update options if provided
    if field_update.options is not None and db_field.field_type in ["select", "multiselect"]:
        # Delete existing options
        db.query(DynamicFieldOption).filter(DynamicFieldOption.field_id == field_id).delete()
        
        # Add new options
        for option_data in field_update.options:
            db_option = DynamicFieldOption(
                field_id=field_id,
                value=option_data.value,
                label=option_data.label,
                sort_order=option_data.sort_order,
                is_active=option_data.is_active
            )
            db.add(db_option)
    
    db.commit()
    db.refresh(db_field)
    return db_field

def delete_dynamic_field(db: Session, field_id: int) -> bool:
    """Soft delete a dynamic field (set is_active=False)"""
    db_field = db.query(DynamicField).filter(DynamicField.id == field_id).first()
    if not db_field:
        return False
    
    db_field.is_active = False
    db.commit()
    return True

def hard_delete_dynamic_field(db: Session, field_id: int) -> bool:
    """Hard delete a dynamic field and all associated data"""
    # Delete field values first
    db.query(ArticleFieldValue).filter(ArticleFieldValue.field_id == field_id).delete()
    
    # Delete field options
    db.query(DynamicFieldOption).filter(DynamicFieldOption.field_id == field_id).delete()
    
    # Delete the field
    deleted = db.query(DynamicField).filter(DynamicField.id == field_id).delete()
    
    db.commit()
    return deleted > 0

# Article Field Values CRUD
def get_article_field_values(db: Session, article_id: int) -> List[ArticleFieldValue]:
    """Get all field values for an article"""
    return db.query(ArticleFieldValue).filter(
        ArticleFieldValue.article_id == article_id
    ).join(DynamicField).filter(
        DynamicField.is_active == True
    ).all()

def set_article_field_value(db: Session, article_id: int, field_id: int, value: str) -> ArticleFieldValue:
    """Set or update a field value for an article"""
    # Check if value already exists
    db_value = db.query(ArticleFieldValue).filter(
        and_(
            ArticleFieldValue.article_id == article_id,
            ArticleFieldValue.field_id == field_id
        )
    ).first()
    
    if db_value:
        # Update existing value
        db_value.value = value
        db_value.updated_at = datetime.utcnow()
    else:
        # Create new value
        db_value = ArticleFieldValue(
            article_id=article_id,
            field_id=field_id,
            value=value
        )
        db.add(db_value)
    
    db.commit()
    db.refresh(db_value)
    return db_value

def delete_article_field_value(db: Session, article_id: int, field_id: int) -> bool:
    """Delete a field value for an article"""
    deleted = db.query(ArticleFieldValue).filter(
        and_(
            ArticleFieldValue.article_id == article_id,
            ArticleFieldValue.field_id == field_id
        )
    ).delete()
    
    db.commit()
    return deleted > 0

def batch_set_article_field_values(db: Session, article_id: int, field_values: Dict[int, str]) -> List[ArticleFieldValue]:
    """Set multiple field values for an article in one transaction"""
    results = []
    
    for field_id, value in field_values.items():
        # Check if value already exists
        db_value = db.query(ArticleFieldValue).filter(
            and_(
                ArticleFieldValue.article_id == article_id,
                ArticleFieldValue.field_id == field_id
            )
        ).first()
        
        if db_value:
            # Update existing value
            db_value.value = value
            db_value.updated_at = datetime.utcnow()
        else:
            # Create new value
            db_value = ArticleFieldValue(
                article_id=article_id,
                field_id=field_id,
                value=value
            )
            db.add(db_value)
        
        results.append(db_value)
    
    db.commit()
    
    # Refresh all objects
    for db_value in results:
        db.refresh(db_value)
    
    return results


# =============================
# Platform/Product CRUD & Links
# =============================

# Platform CRUD
def get_platforms(db: Session, include_inactive: bool = False) -> List[Platform]:
    query = db.query(Platform)
    if not include_inactive:
        query = query.filter(Platform.is_active == True)
    return query.order_by(Platform.name).all()


def get_platform(db: Session, platform_id: int) -> Optional[Platform]:
    return db.query(Platform).filter(Platform.id == platform_id).first()


def create_platform(db: Session, name: str, slug: Optional[str] = None, description: Optional[str] = None, is_active: bool = True) -> Platform:
    platform = Platform(name=name, slug=slug, description=description, is_active=is_active)
    db.add(platform)
    db.commit()
    db.refresh(platform)
    return platform


def update_platform(db: Session, platform_id: int, data: Dict) -> Optional[Platform]:
    platform = get_platform(db, platform_id)
    if not platform:
        return None
    for k, v in data.items():
        setattr(platform, k, v)
    db.commit()
    db.refresh(platform)
    return platform


def delete_platform(db: Session, platform_id: int, hard_delete: bool = False) -> bool:
    platform = get_platform(db, platform_id)
    if not platform:
        return False
    if hard_delete:
        # Remove associations then platform
        db.query(ArticlePlatform).filter(ArticlePlatform.platform_id == platform_id).delete()
        db.delete(platform)
    else:
        platform.is_active = False
    db.commit()
    return True


# Product CRUD
def get_products(db: Session, include_inactive: bool = False) -> List[Product]:
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.is_active == True)
    return query.order_by(Product.name).all()


def get_product(db: Session, product_id: int) -> Optional[Product]:
    return db.query(Product).filter(Product.id == product_id).first()


def create_product(db: Session, name: str, slug: Optional[str] = None, description: Optional[str] = None, is_active: bool = True) -> Product:
    product = Product(name=name, slug=slug, description=description, is_active=is_active)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, data: Dict) -> Optional[Product]:
    product = get_product(db, product_id)
    if not product:
        return None
    for k, v in data.items():
        setattr(product, k, v)
    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: int, hard_delete: bool = False) -> bool:
    product = get_product(db, product_id)
    if not product:
        return False
    if hard_delete:
        # Remove associations then product
        db.query(ArticleProduct).filter(ArticleProduct.product_id == product_id).delete()
        db.delete(product)
    else:
        product.is_active = False
    db.commit()
    return True


# Associations with Articles
def get_article_platforms(db: Session, article_id: int) -> List[Platform]:
    return (
        db.query(Platform)
        .join(ArticlePlatform, ArticlePlatform.platform_id == Platform.id)
        .filter(ArticlePlatform.article_id == article_id)
        .all()
    )


def set_article_platforms(db: Session, article_id: int, platform_ids: List[int]) -> List[Platform]:
    # Remove associations not in new set
    db.query(ArticlePlatform).filter(ArticlePlatform.article_id == article_id, ArticlePlatform.platform_id.notin_(platform_ids or [-1])).delete(synchronize_session=False)
    # Add missing links
    existing = {
        ap.platform_id
        for ap in db.query(ArticlePlatform).filter(ArticlePlatform.article_id == article_id).all()
    }
    for pid in (platform_ids or []):
        if pid not in existing:
            db.add(ArticlePlatform(article_id=article_id, platform_id=pid))
    db.commit()
    return get_article_platforms(db, article_id)


def get_article_products(db: Session, article_id: int) -> List[Product]:
    return (
        db.query(Product)
        .join(ArticleProduct, ArticleProduct.product_id == Product.id)
        .filter(ArticleProduct.article_id == article_id)
        .all()
    )


def set_article_products(db: Session, article_id: int, product_ids: List[int]) -> List[Product]:
    # Remove associations not in new set
    db.query(ArticleProduct).filter(ArticleProduct.article_id == article_id, ArticleProduct.product_id.notin_(product_ids or [-1])).delete(synchronize_session=False)
    # Add missing links
    existing = {
        ap.product_id
        for ap in db.query(ArticleProduct).filter(ArticleProduct.article_id == article_id).all()
    }
    for pid in (product_ids or []):
        if pid not in existing:
            db.add(ArticleProduct(article_id=article_id, product_id=pid))
    db.commit()
    return get_article_products(db, article_id)
