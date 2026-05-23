import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class Study(Base):
    __tablename__ = "studies"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    species: Mapped[str] = mapped_column(String(100), nullable=True)
    study_type: Mapped[str] = mapped_column(String(100), nullable=True)
    sendig_version: Mapped[str] = mapped_column(String(20), default="3.1")
    status: Mapped[str] = mapped_column(SAEnum("Draft","InProgress","Validated","Locked", name="study_status"), default="Draft")
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    domains: Mapped[list["Domain"]] = relationship("Domain", back_populates="study", cascade="all, delete-orphan")  # noqa
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="study", cascade="all, delete-orphan")  # noqa
