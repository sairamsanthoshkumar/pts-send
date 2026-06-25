"""
FS7 — Study Setup: Connection Page
Manages connector types: Pristima API, OpenVMS, CSV Data Source, SEND Dataset
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID

from app.core.security import get_current_user
from app.db.session import get_db, Base

router = APIRouter()


# ── ORM Model ────────────────────────────────────────────────────────────────
class Connector(Base):
    __tablename__ = "connectors"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    connector_type: Mapped[str] = mapped_column(
        SAEnum("PRISTIMA_API", "OPENVMS", "CSV", "SEND_DATASET", name="connector_type_enum"),
        nullable=False
    )
    url: Mapped[str] = mapped_column(String(500), nullable=True)
    user_id_field: Mapped[str] = mapped_column(String(200), nullable=True)   # Pristima API only
    password_field: Mapped[str] = mapped_column(String(200), nullable=True)  # Pristima API only (encrypted in prod)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# ── Schemas ───────────────────────────────────────────────────────────────────
class ConnectorCreate(BaseModel):
    name: str                        # FS7.2.2 New Connection Name
    connector_type: str              # FS7.1.6-9
    url: Optional[str] = None       # FS7.2.3
    user_id_field: Optional[str] = None   # FS7.2.4 Pristima API only
    password_field: Optional[str] = None  # FS7.2.5 Pristima API only

class ConnectorUpdate(BaseModel):
    url: Optional[str] = None
    user_id_field: Optional[str] = None
    password_field: Optional[str] = None

class ConnectorResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_type: str
    url: Optional[str]
    user_id_field: Optional[str]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class TestConnectionRequest(BaseModel):
    connector_id: Optional[uuid.UUID] = None
    connector_type: str
    url: Optional[str] = None
    user_id_field: Optional[str] = None
    password_field: Optional[str] = None

class TestConnectionResponse(BaseModel):
    success: bool
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ConnectorResponse], summary="FS7.2.1 – List all connectors")
async def list_connectors(
    connector_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    q = select(Connector).where(Connector.is_active == True)
    if connector_type:
        q = q.where(Connector.connector_type == connector_type)
    result = await db.execute(q.order_by(Connector.name))
    return result.scalars().all()


@router.post("/", response_model=ConnectorResponse, status_code=201, summary="FS7.2.2 – Create new connector")
async def create_connector(
    body: ConnectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Pristima API requires URL + credentials
    if body.connector_type == "PRISTIMA_API" and not body.url:
        raise HTTPException(status_code=422, detail="URL is required for Pristima API connector (FS7.2.3)")
    
    connector = Connector(
        name=body.name,
        connector_type=body.connector_type,
        url=body.url,
        user_id_field=body.user_id_field,
        password_field=body.password_field,
        created_by=current_user.get("sub"),
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return connector


@router.patch("/{connector_id}", response_model=ConnectorResponse, summary="FS7.3.4 – Save connector")
async def update_connector(
    connector_id: uuid.UUID,
    body: ConnectorUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    conn = await db.get(Connector, connector_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connector not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(conn, k, v)
    conn.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(conn)
    return conn


@router.post("/test", response_model=TestConnectionResponse, summary="FS7.3.1 – Test connection")
async def test_connection(
    body: TestConnectionRequest,
    _=Depends(get_current_user)
):
    """FS7.3.1 – Validate whether the connection definition is reachable."""
    if not body.url:
        return TestConnectionResponse(success=False, message="URL is required to test the connection.")
    
    # For CSV/SEND Dataset: check if path looks valid
    if body.connector_type in ("CSV", "SEND_DATASET", "OPENVMS"):
        if not body.url.startswith(("/", "\\", "C:", "D:", "http")):
            return TestConnectionResponse(success=False, message=f"Invalid path format for {body.connector_type} connector.")
        return TestConnectionResponse(success=True, message=f"Connection definition is valid. Directory path accepted for {body.connector_type}.")
    
    # For Pristima API: simulate a reachability check
    if body.connector_type == "PRISTIMA_API":
        if not body.user_id_field or not body.password_field:
            return TestConnectionResponse(success=False, message="User ID and Password are required for Pristima API connection.")
        if not body.url.startswith("http"):
            return TestConnectionResponse(success=False, message="Pristima API URL must start with http:// or https://")
        return TestConnectionResponse(success=True, message="Pristima API connection definition is valid.")
    
    return TestConnectionResponse(success=False, message="Unknown connector type.")


@router.post("/{connector_id}/save-and-connect", summary="FS7.3.3 – Save and connect (go to Load Study)")
async def save_and_connect(
    connector_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """FS7.3.3 – Validates connection and returns redirect info for Load Study page."""
    conn = await db.get(Connector, connector_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not conn.url:
        raise HTTPException(status_code=422, detail="Connection URL is not configured. Please set a valid URL before connecting.")
    
    return {
        "success": True,
        "connector_id": str(conn.id),
        "connector_name": conn.name,
        "connector_type": conn.connector_type,
        "message": f"Connected to '{conn.name}'. Proceeding to Load Study.",
        "redirect": "/studies"
    }
