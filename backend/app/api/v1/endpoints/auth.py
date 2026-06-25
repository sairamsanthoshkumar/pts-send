"""
FS5 — Login with User ID, Password, Language, Date Format
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.core.security import verify_password, create_access_token

router = APIRouter()

# Pre-computed bcrypt hashes
DEMO_USERS = {
    "admin": {
        "password_hash": "$2b$12$RNlGQVsBzYzZPZrioZscmeiTERWHipv9cP6MYDoTEWIeYqJJgJHmi",
        "name": "Admin User", "role": "admin", "email": "admin@ptssend.com",
        "account_status": "active",  # active | expired | locked | inactive
        "password_status": "ok",     # ok | expired | reset
    },
    "analyst": {
        "password_hash": "$2b$12$f4aMe/ntOepXyGwjHGyU1uI7MSZ5d6XvJOwFxLSThfzSiCffIp3ki",
        "name": "Data Analyst", "role": "analyst", "email": "analyst@ptssend.com",
        "account_status": "active",
        "password_status": "ok",
    },
}

# In-memory store for user preferences (date format per FS5.6)
# In production this would be persisted in the DB
USER_PREFS: dict = {}


class LoginRequest(BaseModel):
    username: str           # FS5.1
    password: str           # FS5.2
    language: str = "en"    # FS5.3
    date_format: str = "MM/DD/YYYY"  # FS5.6


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    preferred_date_format: str
    preferred_language: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    # FS5.4.2 — empty fields
    if not body.username or not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID and Password are required."
        )

    user = DEMO_USERS.get(body.username.lower())

    # FS5.4.2 — wrong credentials
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid User ID or Password."
        )

    # FS5.4.4 — account status checks
    status_messages = {
        "expired":  "Your account has expired. Please contact your Administrator.",
        "locked":   "Your account has been locked. Please contact your Administrator.",
        "inactive": "Your account is inactive. Please contact your Administrator.",
    }
    if user["account_status"] in status_messages:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=status_messages[user["account_status"]]
        )

    # FS5.4.3 — password expired or reset
    if user["password_status"] in ("expired", "reset"):
        msg = "Your password has expired." if user["password_status"] == "expired" else "Your password has been reset by the Administrator."
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=msg,
            headers={"X-Password-Change-Required": "true"}
        )

    # FS5.6 — save date format preference; auto-populate on next login
    USER_PREFS[body.username] = {
        "date_format": body.date_format,
        "language": body.language,
    }

    token = create_access_token(
        subject=body.username,
        extra={"name": user["name"], "role": user["role"], "email": user["email"]}
    )

    return LoginResponse(
        access_token=token,
        user={"username": body.username, "name": user["name"], "role": user["role"], "email": user["email"]},
        preferred_date_format=body.date_format,
        preferred_language=body.language,
    )


@router.get("/preferences/{username}")
async def get_preferences(username: str):
    """FS5.6 — Return saved preferences so date format auto-populates on next login."""
    prefs = USER_PREFS.get(username.lower(), {})
    return {
        "date_format": prefs.get("date_format", "MM/DD/YYYY"),
        "language": prefs.get("language", "en"),
    }
