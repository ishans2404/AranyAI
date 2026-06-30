"""
AranyAI authentication — password hashing + JWT issuing/verification.

There is no public signup endpoint by design: accounts are provisioned by
an administrator via scripts/seed_users.py. See database.User docstring.
"""
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Header, HTTPException
import bcrypt

from .config import settings
from .database import User, get_session


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user: User) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub":   user.id,
        "email": user.email,
        "role":  user.role,
        "name":  user.name,
        "exp":   expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired session — please sign in again")


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency — validates the Bearer token and loads the user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token)

    with get_session() as db:
        user = (
            db.query(User)
            .filter(User.id == payload.get("sub"), User.is_active == True)
            .first()
        )
        if not user:
            raise HTTPException(401, "Account not found or deactivated")
        return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}