#!/usr/bin/env python3
"""
Script to create admin user permissions in the database.
Run this to grant admin access to a user.
"""

import sys
import os
# Add the backend directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.database import get_db, SessionLocal
from app.models import UserPermissions, UserRole
from app.crud import create_or_update_user_permissions, get_user_permissions

def create_admin_user(user_id: str):
    """Create admin permissions for a user"""
    db = SessionLocal()
    try:
        # Check if user already has permissions
        existing = get_user_permissions(db, user_id)
        if existing:
            print(f"User {user_id} already has permissions: {existing.role}")
            # Update to admin if not already
            if existing.role != UserRole.ADMIN:
                existing.role = UserRole.ADMIN
                existing.is_active = True
                db.commit()
                print(f"✅ Updated user {user_id} to admin role")
            else:
                print(f"✅ User {user_id} already has admin role")
        else:
            # Create new admin permissions
            permissions = create_or_update_user_permissions(db, user_id, UserRole.ADMIN)
            if permissions:
                print(f"✅ Created admin permissions for user {user_id}")
            else:
                print(f"❌ Failed to create permissions for user {user_id}")
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    user_id = sys.argv[1] if len(sys.argv) > 1 else "1"
    print(f"Creating admin permissions for user {user_id}...")
    create_admin_user(user_id)
