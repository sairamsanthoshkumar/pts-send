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

class ValidationIssue(Base):
    """FS27 validation issue captured for a study record."""
    __tablename__ = "validation_issues"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    domain: Mapped[str] = mapped_column(String(10), nullable=False)
    variable: Mapped[str] = mapped_column(String(100), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class RawMeasurement(Base):
    """Raw measurement data imported from an external CSV source."""
    __tablename__ = "raw_measurements"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(100), nullable=False, default="AUTO")
    source_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    record_id: Mapped[str] = mapped_column(String(255), nullable=True)
    idvar: Mapped[str] = mapped_column(String(100), nullable=True)
    idvarval: Mapped[str] = mapped_column(String(500), nullable=True)
    r_domain: Mapped[str] = mapped_column(String(10), nullable=True)
    row_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    study: Mapped["Study"] = relationship("Study", back_populates="raw_measurements")

class SampleCollection(Base):
    """Tube collection and dosing metadata used to enrich PC/PP records."""
    __tablename__ = "sample_collections"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False)
    sample_key: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    study: Mapped["Study"] = relationship("Study", back_populates="sample_collections")

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

class CTInstalledVersion(Base):
    """Installed CT package metadata loaded by an administrator."""
    __tablename__ = "ct_installed_versions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    previous_version: Mapped[str] = mapped_column(String(100), nullable=True)
    source_file: Mapped[str] = mapped_column(String(255), nullable=True)
    installed_by: Mapped[str] = mapped_column(String(255), nullable=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class CTInstalledTerm(Base):
    """A term imported from an installed CT package."""
    __tablename__ = "ct_installed_terms"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    codelist_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    codelist_name: Mapped[str] = mapped_column(String(255), nullable=True)
    codelist_extensible: Mapped[str] = mapped_column(String(8), nullable=True)
    code: Mapped[str] = mapped_column(String(255), nullable=False)
    submission_value: Mapped[str] = mapped_column(String(512), nullable=True)
    name_in_data: Mapped[str] = mapped_column(String(1024), nullable=True)
    value_key: Mapped[str] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(String(1), nullable=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class StudyFocusMapping(Base):
    """FS27.31.5 – study-level tissue/location to FOCID mapping."""
    __tablename__ = "study_focus_mappings"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False, index=True)
    domain_code: Mapped[str] = mapped_column(String(10), nullable=False)
    fixed_type: Mapped[str] = mapped_column(String(30), nullable=False, default="Dosing")
    source_value: Mapped[str] = mapped_column(String(500), nullable=False)
    focid: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(500), nullable=True)
    subcategory: Mapped[str] = mapped_column(String(500), nullable=True)
    tissue_flag: Mapped[str] = mapped_column(String(30), nullable=True)
    locator: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

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
    editable: Mapped[str] = mapped_column(String(1), default="Y")
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
