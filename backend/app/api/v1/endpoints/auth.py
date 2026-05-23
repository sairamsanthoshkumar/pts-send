from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter()
DEMO_USERS = {
    "admin@ptssend.com": {"password_hash": hash_password("admin123"), "name": "Admin User", "role": "admin"},
    "analyst@ptssend.com": {"password_hash": hash_password("analyst123"), "name": "Data Analyst", "role": "analyst"},
}

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(body: LoginRequest):
    user = DEMO_USERS.get(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(subject=body.email, extra={"name": user["name"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "user": {"email": body.email, "name": user["name"], "role": user["role"]}}
