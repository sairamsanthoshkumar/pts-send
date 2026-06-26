"""FS5 — Login with Email, Password, Language, Date Format"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.core.security import verify_password, create_access_token

router = APIRouter()

DEMO_USERS = {
    "admin@ptssend.com": {
        "password_hash": "$2b$12$RNlGQVsBzYzZPZrioZscmeiTERWHipv9cP6MYDoTEWIeYqJJgJHmi",
        "name": "Admin User", "role": "admin",
        "account_status": "active", "password_status": "ok",
    },
    "analyst@ptssend.com": {
        "password_hash": "$2b$12$f4aMe/ntOepXyGwjHGyU1uI7MSZ5d6XvJOwFxLSThfzSiCffIp3ki",
        "name": "Data Analyst", "role": "analyst",
        "account_status": "active", "password_status": "ok",
    },
}

USER_PREFS: dict = {}


class LoginRequest(BaseModel):
    email: str
    password: str
    language: str = "en"
    date_format: str = "MM/DD/YYYY"


@router.post("/login")
async def login(body: LoginRequest):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and Password are required.")

    user = DEMO_USERS.get(body.email.lower().strip())
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    status_messages = {
        "expired":  "Your account has expired. Please contact your Administrator.",
        "locked":   "Your account has been locked. Please contact your Administrator.",
        "inactive": "Your account is inactive. Please contact your Administrator.",
    }
    if user["account_status"] in status_messages:
        raise HTTPException(status_code=403, detail=status_messages[user["account_status"]])

    if user["password_status"] in ("expired", "reset"):
        msg = "Your password has expired." if user["password_status"] == "expired" else "Your password has been reset by the Administrator."
        raise HTTPException(status_code=403, detail=msg, headers={"X-Password-Change-Required": "true"})

    USER_PREFS[body.email] = {"date_format": body.date_format, "language": body.language}

    token = create_access_token(
        subject=body.email,
        extra={"name": user["name"], "role": user["role"], "email": body.email}
    )
    return {
        "access_token": token, "token_type": "bearer",
        "user": {"email": body.email, "name": user["name"], "role": user["role"]},
        "preferred_date_format": body.date_format,
        "preferred_language": body.language,
    }


@router.get("/preferences/{email}")
async def get_preferences(email: str):
    prefs = USER_PREFS.get(email.lower(), {})
    return {"date_format": prefs.get("date_format", "MM/DD/YYYY"), "language": prefs.get("language", "en")}
