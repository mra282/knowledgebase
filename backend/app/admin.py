from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import crud, schemas
from app.models import DynamicField, DynamicFieldOption, ArticleFieldValue
from app.auth import get_current_user_with_permissions

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

# Dynamic Fields Management

@router.get("/dynamic-fields", response_model=List[schemas.DynamicFieldResponse])
def get_dynamic_fields(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get all dynamic fields.
    Only admins should access this endpoint.
    """
    fields = crud.get_dynamic_fields(db, include_inactive=include_inactive)
    return fields

@router.get("/dynamic-fields/{field_id}", response_model=schemas.DynamicFieldResponse)
def get_dynamic_field(
    field_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific dynamic field by ID.
    """
    field = crud.get_dynamic_field(db, field_id=field_id)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dynamic field not found"
        )
    return field

@router.post("/dynamic-fields", response_model=schemas.DynamicFieldResponse)
def create_dynamic_field(
    field: schemas.DynamicFieldCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new dynamic field.
    For select/multiselect fields, include options in the request.
    """
    try:
        return crud.create_dynamic_field(db=db, field=field)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A field with the name '{field.name}' already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating field: {str(e)}"
        )

@router.put("/dynamic-fields/{field_id}", response_model=schemas.DynamicFieldResponse)
def update_dynamic_field(
    field_id: int,
    field_update: schemas.DynamicFieldUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a dynamic field and its options.
    """
    field = crud.update_dynamic_field(db=db, field_id=field_id, field_update=field_update)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dynamic field not found"
        )
    return field

@router.delete("/dynamic-fields/{field_id}")
def delete_dynamic_field(
    field_id: int,
    hard_delete: bool = False,
    db: Session = Depends(get_db)
):
    """
    Delete a dynamic field.
    By default performs soft delete (sets is_active=False).
    Use hard_delete=True to permanently remove the field and all associated data.
    """
    if hard_delete:
        success = crud.hard_delete_dynamic_field(db=db, field_id=field_id)
        action = "permanently deleted"
    else:
        success = crud.delete_dynamic_field(db=db, field_id=field_id)
        action = "deactivated"
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dynamic field not found"
        )
    
    return {"message": f"Dynamic field {action} successfully"}

# Article Field Values Management

@router.get("/articles/{article_id}/field-values", response_model=List[schemas.ArticleFieldValueResponse])
def get_article_field_values(
    article_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all dynamic field values for a specific article.
    """
    # Verify article exists
    article = crud.get_article(db, article_id=article_id)
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found"
        )
    
    return crud.get_article_field_values(db=db, article_id=article_id)

@router.put("/articles/{article_id}/field-values/{field_id}")
def set_article_field_value(
    article_id: int,
    field_id: int,
    field_value: schemas.ArticleFieldValueCreate,
    db: Session = Depends(get_db)
):
    """
    Set or update a specific field value for an article.
    """
    # Verify article exists
    article = crud.get_article(db, article_id=article_id)
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found"
        )
    
    # Verify field exists
    field = crud.get_dynamic_field(db, field_id=field_id)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dynamic field not found"
        )
    
    try:
        result = crud.set_article_field_value(
            db=db, 
            article_id=article_id, 
            field_id=field_id, 
            value=field_value.value
        )
        return {"message": "Field value updated successfully", "id": result.id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error setting field value: {str(e)}"
        )

@router.post("/articles/{article_id}/field-values/batch")
def batch_set_article_field_values(
    article_id: int,
    field_values: List[schemas.ArticleFieldValueCreate],
    db: Session = Depends(get_db)
):
    """
    Set multiple field values for an article in one request.
    """
    # Verify article exists
    article = crud.get_article(db, article_id=article_id)
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found"
        )
    
    # Convert to dict format expected by CRUD function
    field_value_dict = {}
    for fv in field_values:
        field_value_dict[fv.field_id] = fv.value
    
    try:
        results = crud.batch_set_article_field_values(
            db=db, 
            article_id=article_id, 
            field_values=field_value_dict
        )
        return {
            "message": f"Updated {len(results)} field values successfully",
            "updated_fields": [r.field_id for r in results]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error setting field values: {str(e)}"
        )

@router.delete("/articles/{article_id}/field-values/{field_id}")
def delete_article_field_value(
    article_id: int,
    field_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a specific field value for an article.
    """
    success = crud.delete_article_field_value(db=db, article_id=article_id, field_id=field_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field value not found"
        )
    
    return {"message": "Field value deleted successfully"}

# ================================
# Platforms & Products Management
# ================================

# Guard helper
def _require_admin_or_moderator(current_user) -> None:
    if not (current_user.user_role in ["admin", "moderator"] or current_user.has_permission("manage_users")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


@router.get("/platforms", response_model=List[schemas.PlatformResponse])
def list_platforms(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    return crud.get_platforms(db, include_inactive=include_inactive)


@router.post("/platforms", response_model=schemas.PlatformResponse)
def create_platform(
    payload: schemas.PlatformCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    try:
        return crud.create_platform(db, name=payload.name, slug=payload.slug, description=payload.description, is_active=payload.is_active)
    except Exception as e:
        if "UNIQUE" in str(e).upper():
            raise HTTPException(status_code=400, detail="Platform with that name or slug already exists")
        raise


@router.put("/platforms/{platform_id}", response_model=schemas.PlatformResponse)
def update_platform(
    platform_id: int,
    payload: schemas.PlatformUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    platform = crud.update_platform(db, platform_id, {k: v for k, v in payload.dict(exclude_unset=True).items()})
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


@router.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    hard_delete: bool = False,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    success = crud.delete_platform(db, platform_id, hard_delete=hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Platform not found")
    return {"message": "Platform deleted"}


@router.get("/products", response_model=List[schemas.ProductResponse])
def list_products(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    return crud.get_products(db, include_inactive=include_inactive)


@router.post("/products", response_model=schemas.ProductResponse)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    try:
        return crud.create_product(db, name=payload.name, slug=payload.slug, description=payload.description, is_active=payload.is_active)
    except Exception as e:
        if "UNIQUE" in str(e).upper():
            raise HTTPException(status_code=400, detail="Product with that name or slug already exists")
        raise


@router.put("/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    product = crud.update_product(db, product_id, {k: v for k, v in payload.dict(exclude_unset=True).items()})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    hard_delete: bool = False,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    success = crud.delete_product(db, product_id, hard_delete=hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}


# Article association endpoints
@router.get("/articles/{article_id}/platforms", response_model=List[schemas.PlatformResponse])
def get_article_platforms(
    article_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    # Ensure article exists
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    return crud.get_article_platforms(db, article_id)


@router.put("/articles/{article_id}/platforms", response_model=List[schemas.PlatformResponse])
def set_article_platforms(
    article_id: int,
    payload: schemas.ArticlePlatformSet,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    return crud.set_article_platforms(db, article_id, payload.platform_ids)


@router.get("/articles/{article_id}/products", response_model=List[schemas.ProductResponse])
def get_article_products(
    article_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    return crud.get_article_products(db, article_id)


@router.put("/articles/{article_id}/products", response_model=List[schemas.ProductResponse])
def set_article_products(
    article_id: int,
    payload: schemas.ArticleProductSet,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    return crud.set_article_products(db, article_id, payload.product_ids)

# =====================
# Article Versioning API
# =====================

@router.get("/articles/{article_id}/versions", response_model=List[schemas.ArticleVersionResponse])
def list_versions(
    article_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    if not crud.get_article(db, article_id):
        raise HTTPException(status_code=404, detail="Article not found")
    return crud.list_article_versions(db, article_id)

@router.post("/articles/{article_id}/versions/draft", response_model=schemas.ArticleVersionResponse, status_code=201)
def create_draft(
    article_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    draft = crud.create_draft_version(db, article_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Article not found")
    return draft

@router.put("/articles/{article_id}/versions/{version_number}", response_model=schemas.ArticleVersionResponse)
def update_draft(
    article_id: int,
    version_number: int,
    payload: schemas.ArticleVersionDraftUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    draft = crud.update_draft_version(db, article_id, version_number, payload.dict(exclude_unset=True))
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft

@router.post("/articles/{article_id}/versions/{version_number}/publish", response_model=schemas.ArticleResponse)
def publish_draft(
    article_id: int,
    version_number: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    art = crud.publish_draft_version(db, article_id, version_number)
    if not art:
        raise HTTPException(status_code=404, detail="Draft not found")
    return schemas.ArticleResponse.from_orm(art)

@router.post("/articles/{article_id}/versions/{version_number}/rollback", response_model=schemas.ArticleResponse)
def rollback_article(
    article_id: int,
    version_number: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_with_permissions),
):
    _require_admin_or_moderator(current_user)
    art = crud.rollback_article_to_version(db, article_id, version_number)
    if not art:
        raise HTTPException(status_code=404, detail="Version not found or not publishable")
    return schemas.ArticleResponse.from_orm(art)

# Utility endpoints for field management

@router.get("/field-types")
def get_field_types():
    """
    Get all available field types for creating dynamic fields.
    """
    from app.models import FieldType
    return {
        "field_types": [
            {
                "value": field_type.value,
                "label": field_type.value.title(),
                "description": _get_field_type_description(field_type.value)
            }
            for field_type in FieldType
        ]
    }

def _get_field_type_description(field_type: str) -> str:
    """Get human-readable description for field types"""
    descriptions = {
        "text": "Single line text input",
        "textarea": "Multi-line text input", 
        "select": "Dropdown menu (single selection)",
        "multiselect": "Multiple selection dropdown",
        "checkbox": "Boolean checkbox",
        "number": "Numeric input",
        "date": "Date picker",
        "email": "Email input with validation",
        "url": "URL input with validation"
    }
    return descriptions.get(field_type, "Custom field type")

@router.post("/articles/{article_id}/validate-field-values")
def validate_article_field_values(
    article_id: int,
    field_values: List[schemas.ArticleFieldValueCreate],
    db: Session = Depends(get_db)
):
    """
    Validate field values without saving them.
    Returns validation errors if any.
    """
    errors = []
    
    for field_value in field_values:
        field = crud.get_dynamic_field(db, field_id=field_value.field_id)
        if not field:
            errors.append(f"Field {field_value.field_id} does not exist")
            continue
        
        # Basic validation based on field type
        if field.is_required and not field_value.value.strip():
            errors.append(f"Field '{field.label}' is required")
            continue
        
        # Type-specific validation
        if field.field_type == "number":
            try:
                float(field_value.value)
            except ValueError:
                errors.append(f"Field '{field.label}' must be a number")
        
        elif field.field_type == "email":
            import re
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if field_value.value and not re.match(email_pattern, field_value.value):
                errors.append(f"Field '{field.label}' must be a valid email address")
        
        elif field.field_type == "url":
            import re
            url_pattern = r'^https?://.+'
            if field_value.value and not re.match(url_pattern, field_value.value):
                errors.append(f"Field '{field.label}' must be a valid URL")
        
        elif field.field_type in ["select", "multiselect"]:
            # Validate against available options
            valid_options = [opt.value for opt in field.options if opt.is_active]
            if field.field_type == "multiselect":
                # For multiselect, value should be comma-separated
                selected_values = [v.strip() for v in field_value.value.split(",")]
                invalid_values = [v for v in selected_values if v not in valid_options]
                if invalid_values:
                    errors.append(f"Field '{field.label}' contains invalid options: {', '.join(invalid_values)}")
            else:
                # For single select
                if field_value.value not in valid_options:
                    errors.append(f"Field '{field.label}' contains invalid option: {field_value.value}")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }
