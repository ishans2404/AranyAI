#!/usr/bin/env python3
"""
AranyAI — Seed auth users
==========================
Creates/updates demo accounts with bcrypt-hashed passwords directly in
the database. There is no public signup endpoint — accounts are
admin-provisioned, this script is that provisioning step for the POC.

`name` for ranger accounts must match RangerAssignment.ranger_name
(see scripts/seed_rangers.py) so area-scoping keeps working.

Usage:
  python scripts/seed_users.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.auth import hash_password
from backend.database import Base, User, engine, get_session

Base.metadata.create_all(bind=engine)

USERS = [
    {"email": "admin@aranyai.com",   "password": "Arany@26", "name": "Administrator", "role": "admin"},
    {"email": "rsharma@aranyai.com", "password": "Arany@26", "name": "R. Sharma",      "role": "ranger"},
    {"email": "averma@aranyai.com",  "password": "Arany@26", "name": "A. Verma",       "role": "ranger"},
]

with get_session() as db:
    for u in USERS:
        existing = db.query(User).filter(User.email == u["email"]).first()
        if existing:
            existing.password_hash = hash_password(u["password"])
            existing.name = u["name"]
            existing.role = u["role"]
            existing.is_active = True
            print(f"  updated  {u['email']}  ({u['role']})")
        else:
            db.add(User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                name=u["name"],
                role=u["role"],
            ))
            print(f"  created  {u['email']}  ({u['role']})")

print("\nDone. Run scripts/seed_rangers.py separately to assign AOIs to "
      "R. Sharma / A. Verma if not already done.")