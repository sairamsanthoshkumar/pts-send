import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class Domain(Base):
    """FS27 – All SEND domains"""
    __tablename__ = "domains"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False)
    domain_code: Mapped[str] = mapped_column(String(10), nullable=False)
    domain_label: Mapped[str] = mapped_column(String(200), nullable=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        SAEnum("Pending","Processing","Generated","Validated","Failed", name="domain_status"),
        default="Pending"
    )
    xpt_storage_path: Mapped[str] = mapped_column(String(500), nullable=True)
    csv_storage_path: Mapped[str] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    validation_errors: Mapped[int] = mapped_column(Integer, default=0)
    validation_warnings: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    study: Mapped["Study"] = relationship("Study", back_populates="domains")  # noqa

class CTMapping(Base):
    """FS24/FS25 – Controlled Terminology mapping"""
    __tablename__ = "ct_mappings"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=True)  # null = global
    domain_code: Mapped[str] = mapped_column(String(10), nullable=False)
    variable_name: Mapped[str] = mapped_column(String(100), nullable=False)
    source_value: Mapped[str] = mapped_column(String(500), nullable=False)
    ct_value: Mapped[str] = mapped_column(String(500), nullable=True)           # CDISC CT submission value
    ct_codelist: Mapped[str] = mapped_column(String(200), nullable=True)
    mapped: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(
        SAEnum("Unmapped","Mapped","Suppressed", name="ct_status"), default="Unmapped"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    study: Mapped["Study"] = relationship("Study", back_populates="ct_mappings")  # noqa

class OutputMapping(Base):
    """FS22 – SEND Output Mapping per domain variable"""
    __tablename__ = "output_mappings"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=True)
    domain_code: Mapped[str] = mapped_column(String(10), nullable=False)
    send_variable: Mapped[str] = mapped_column(String(100), nullable=False)     # e.g. BWSTRESN
    source_field: Mapped[str] = mapped_column(String(200), nullable=True)       # incoming field name
    transform_rule: Mapped[str] = mapped_column(Text, nullable=True)            # optional Python expression
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AuditLog(Base):
    """FS32 – Audit Trail (21 CFR Part 11)"""
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(255), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)                    # FS33 reason selection
    delta: Mapped[dict] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    study: Mapped["Study"] = relationship("Study", back_populates="audit_logs")  # noqa
