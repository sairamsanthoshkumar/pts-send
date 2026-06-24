import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Integer, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class Study(Base):
    __tablename__ = "studies"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FS14 fields
    savante_study_name: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    import_study_name: Mapped[str] = mapped_column(String(255), nullable=True)
    protocol_status: Mapped[str] = mapped_column(String(50), nullable=True)       # FS14.1.4
    savante_status: Mapped[str] = mapped_column(                                   # FS14.1.1
        SAEnum("Setup","DataLoaded","Validated","Approved","Locked", name="savante_status"),
        default="Setup"
    )
    # FS14.1.5-8 Dataset approval
    dataset_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    dataset_approved_by: Mapped[str] = mapped_column(String(255), nullable=True)
    dataset_approved_comment: Mapped[str] = mapped_column(Text, nullable=True)
    dataset_approved_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # FS14.1.9 USUBJID flag
    unique_subject_id_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    # Study details
    species: Mapped[str] = mapped_column(String(100), nullable=True)
    study_type: Mapped[str] = mapped_column(String(100), nullable=True)
    sendig_version: Mapped[str] = mapped_column(String(20), default="3.1")
    connection_type: Mapped[str] = mapped_column(                                  # FS7
        SAEnum("CSV","SEND_DATASET","PRISTIMA_API","OPENVMS", name="connection_type"),
        default="CSV"
    )
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # Relationships
    groups: Mapped[list["StudyGroup"]] = relationship("StudyGroup", back_populates="study", cascade="all, delete-orphan")
    animals: Mapped[list["StudyAnimal"]] = relationship("StudyAnimal", back_populates="study", cascade="all, delete-orphan")
    domains: Mapped[list["Domain"]] = relationship("Domain", back_populates="study", cascade="all, delete-orphan")
    ct_mappings: Mapped[list["CTMapping"]] = relationship("CTMapping", back_populates="study", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="study", cascade="all, delete-orphan")

class StudyGroup(Base):
    """FS15 – Study Definition – Group"""
    __tablename__ = "study_groups"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False)
    group_number: Mapped[str] = mapped_column(String(50), nullable=False)
    control_type: Mapped[str] = mapped_column(String(100), nullable=True)
    male_group_label: Mapped[str] = mapped_column(String(255), nullable=True)   # GRPLBL
    female_group_label: Mapped[str] = mapped_column(String(255), nullable=True)
    male_group_name: Mapped[str] = mapped_column(String(255), nullable=True)
    female_group_name: Mapped[str] = mapped_column(String(255), nullable=True)
    compound: Mapped[str] = mapped_column(Text, nullable=True)
    route: Mapped[str] = mapped_column(String(255), nullable=True)
    num_males: Mapped[int] = mapped_column(Integer, default=0)
    num_females: Mapped[int] = mapped_column(Integer, default=0)
    group_type: Mapped[int] = mapped_column(Integer, nullable=True)
    study: Mapped["Study"] = relationship("Study", back_populates="groups")

class StudyAnimal(Base):
    """FS16 – Study Definition – Animal"""
    __tablename__ = "study_animals"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studies.id"), nullable=False)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("study_groups.id"), nullable=True)
    subject_id: Mapped[str] = mapped_column(String(100), nullable=False)          # SUBJID
    usubjid: Mapped[str] = mapped_column(String(200), nullable=True)              # USUBJID (computed)
    sex: Mapped[str] = mapped_column(String(10), nullable=True)                   # M/F
    species: Mapped[str] = mapped_column(String(100), nullable=True)
    strain: Mapped[str] = mapped_column(String(200), nullable=True)
    rfstdtc: Mapped[str] = mapped_column(String(30), nullable=True)               # Reference Start Date
    rfendtc: Mapped[str] = mapped_column(String(30), nullable=True)
    armcd: Mapped[str] = mapped_column(String(50), nullable=True)
    arm: Mapped[str] = mapped_column(String(200), nullable=True)
    setcd: Mapped[str] = mapped_column(String(50), nullable=True)
    died: Mapped[bool] = mapped_column(Boolean, default=False)
    death_date: Mapped[str] = mapped_column(String(30), nullable=True)
    study: Mapped["Study"] = relationship("Study", back_populates="animals")
