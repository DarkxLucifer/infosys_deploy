import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Float, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

def generate_uuid():
    return str(uuid.uuid4())

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, unique=True)
    allow_self_registration = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    users = relationship("User", back_populates="organization")

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    role = Column(String(64), nullable=False)  # inspector, engineer, maintenance, manager, admin
    requested_role = Column(String(64), nullable=True)
    status = Column(String(32), default="pending_approval", nullable=False)  # pending_approval, active, deactivated, locked
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    sso_subject = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization = relationship("Organization", back_populates="users")
    credential = relationship("UserCredential", back_populates="user", uselist=False, cascade="all, delete-orphan")
    tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("RefreshSession", back_populates="user", cascade="all, delete-orphan")

class UserCredential(Base):
    __tablename__ = "user_credentials"

    user_id = Column(String(64), ForeignKey("users.id"), primary_key=True)
    password_hash = Column(String(255), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="credential")

class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    token_type = Column(String(32), nullable=False)  # verify, reset
    token_hash = Column(String(255), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="tokens")

class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    family_id = Column(String(64), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_used_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")

class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(64), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    created_by = Column(String(64), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), nullable=True)
    actor_email = Column(String(255), nullable=False)
    action = Column(String(128), nullable=False, index=True)
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(String(64), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

class RequestMetric(Base):
    __tablename__ = "request_metrics"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    route = Column(String(255), nullable=False)
    method = Column(String(16), nullable=False)
    status_code = Column(Integer, nullable=False)
    duration_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

class SetupState(Base):
    __tablename__ = "setup_state"

    id = Column(Integer, primary_key=True)
    is_completed = Column(Boolean, default=False)
    setup_token_hash = Column(String(255), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

class DefectType(Base):
    __tablename__ = "defect_types"

    code = Column(String(32), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=False)  # crack, surface_damage

class SeverityLevel(Base):
    __tablename__ = "severity_levels"

    code = Column(String(32), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    level_rank = Column(Integer, nullable=False)

class PriorityCategory(Base):
    __tablename__ = "priority_categories"

    code = Column(String(32), primary_key=True)  # P1, P2, P3, P4, P5
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    sla_days = Column(Integer, nullable=False)

class InfrastructureType(Base):
    __tablename__ = "infrastructure_types"

    code = Column(String(32), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)

class AlertLevel(Base):
    __tablename__ = "alert_levels"

    code = Column(String(32), primary_key=True)  # green, blue, yellow, orange, red
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    severity_order = Column(Integer, nullable=False)

class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(64), primary_key=True)  # Infrastructure ID e.g. BR-018
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    asset_type = Column(String(64), nullable=False, index=True)  # bridge, road, tunnel, retaining-wall, building, dam, culvert, pier
    address = Column(String(512), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    construction_year = Column(Integer, nullable=False)
    material = Column(String(128), nullable=False)
    department = Column(String(128), nullable=False, index=True)
    region = Column(String(128), default="Central", nullable=False, index=True)
    inspection_frequency = Column(String(64), nullable=False)
    importance = Column(String(64), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization = relationship("Organization")
    inspections = relationship("Inspection", back_populates="asset")
    work_orders = relationship("WorkOrder", back_populates="asset")

class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False, index=True)
    asset_id = Column(String(64), ForeignKey("assets.id"), nullable=False, index=True)
    inspector_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    inspection_date = Column(DateTime(timezone=True), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), default="draft", nullable=False, index=True)
    # draft -> assigned -> in_progress -> images_uploaded -> analysing -> pending_review -> in_review -> reviewed -> reported -> closed
    analysis_status = Column(String(32), default="skipped_no_model", nullable=False)  # skipped_no_model, complete, failed
    claimed_by = Column(String(64), ForeignKey("users.id"), nullable=True, index=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    previous_inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=True)
    parent_inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    asset = relationship("Asset", back_populates="inspections")
    inspector = relationship("User", foreign_keys=[inspector_id])
    claimant = relationship("User", foreign_keys=[claimed_by])
    images = relationship("InspectionImage", back_populates="inspection")
    detections = relationship("Detection", back_populates="inspection", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="inspection", cascade="all, delete-orphan")
    priority_recommendations = relationship("PriorityRecommendation", back_populates="inspection", cascade="all, delete-orphan")
    work_orders = relationship("WorkOrder", back_populates="inspection")
    reports = relationship("Report", back_populates="inspection", cascade="all, delete-orphan")

class InspectionImage(Base):
    __tablename__ = "inspection_images"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False, index=True)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=False, index=True)
    uploader_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_path = Column(String(512), nullable=False)
    thumbnail_path = Column(String(512), nullable=True)
    processed_path = Column(String(512), nullable=True)
    sha256 = Column(String(64), nullable=False, index=True)
    phash = Column(String(64), nullable=False, index=True)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    file_size = Column(Integer, nullable=False)
    exif_lat = Column(Float, nullable=True)
    exif_lng = Column(Float, nullable=True)
    exif_captured_at = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(32), default="upload")
    status = Column(String(32), default="valid")  # valid, warned, rejected, deleted
    quality_report = Column(JSON, nullable=True)
    calibration = Column(JSON, nullable=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection = relationship("Inspection", back_populates="images")
    uploader = relationship("User", foreign_keys=[uploader_id])
    processed_versions = relationship("ProcessedImage", back_populates="image")

class ProcessedImage(Base):
    __tablename__ = "processed_images"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    image_id = Column(String(64), ForeignKey("inspection_images.id"), nullable=False, index=True)
    profile_name = Column(String(64), nullable=False)
    steps_applied = Column(JSON, nullable=False)
    output_path = Column(String(512), nullable=False)
    checksum = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    image = relationship("InspectionImage", back_populates="processed_versions")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(255), nullable=True)
    event_type = Column(String(64), nullable=False)  # account_approved, access_request, inspection_assigned
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

    user = relationship("User")

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    purpose = Column(Text, nullable=False)
    suitability_limits = Column(Text, nullable=False)
    license_note = Column(String(255), nullable=False)
    total_samples = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection_stats = relationship("DatasetInspectionStat", back_populates="dataset", cascade="all, delete-orphan")
    class_stats = relationship("DatasetClassStat", back_populates="dataset", cascade="all, delete-orphan")

class DatasetInspectionStat(Base):
    __tablename__ = "dataset_inspection_stats"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    dataset_id = Column(String(64), ForeignKey("datasets.id"), nullable=False, index=True)
    metric_name = Column(String(128), nullable=False)
    metric_value = Column(Float, nullable=False)

    dataset = relationship("Dataset", back_populates="inspection_stats")

class DatasetClassStat(Base):
    __tablename__ = "dataset_class_stats"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    dataset_id = Column(String(64), ForeignKey("datasets.id"), nullable=False, index=True)
    class_code = Column(String(32), nullable=False)
    class_name = Column(String(128), nullable=False)
    sample_count = Column(Integer, default=0)

    dataset = relationship("Dataset", back_populates="class_stats")

class Detection(Base):
    __tablename__ = "detections"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=False, index=True)
    image_id = Column(String(64), ForeignKey("inspection_images.id"), nullable=False, index=True)
    source = Column(String(32), default="engineer_manual", nullable=False)  # engineer_manual, ai_model
    defect_type = Column(String(64), nullable=False)  # longitudinal, transverse, alligator, spalling, etc.
    geometry = Column(JSON, nullable=False)  # polyline, width lines, polygon, or ROI points in pixel coordinates
    severity = Column(String(32), nullable=True)  # minor, moderate, severe, critical, no_visible_damage
    created_by = Column(String(64), ForeignKey("users.id"), nullable=False)
    verified_by = Column(String(64), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    confidence = Column(Float, nullable=True)  # Strictly null for engineer_manual annotations
    model_id = Column(String(64), nullable=True)  # Strictly null for engineer_manual annotations
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection = relationship("Inspection", back_populates="detections")
    image = relationship("InspectionImage")
    creator = relationship("User", foreign_keys=[created_by])
    verifier = relationship("User", foreign_keys=[verified_by])
    measurements = relationship("Measurement", back_populates="detection", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="detection", cascade="all, delete-orphan")

class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    detection_id = Column(String(64), ForeignKey("detections.id"), nullable=False, index=True)
    length = Column(Float, nullable=False)  # px or mm
    avg_width = Column(Float, nullable=False)
    max_width = Column(Float, nullable=False)
    area = Column(Float, nullable=False)
    orientation = Column(Float, nullable=True)  # degrees [0-180)
    branching = Column(Integer, default=0)  # count of junctions
    continuity = Column(Float, default=1.0)  # ratio of connected length to bounding extent
    density = Column(Float, nullable=True)  # percentage of ROI surface area
    unit = Column(String(16), default="px", nullable=False)  # px or mm
    calibrated = Column(Boolean, default=False)
    uncertainty = Column(Float, nullable=True)  # estimated physical uncertainty in mm
    calibration_id = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    detection = relationship("Detection", back_populates="measurements")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=False, index=True)
    detection_id = Column(String(64), ForeignKey("detections.id"), nullable=True, index=True)
    reviewer_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    decision = Column(String(32), nullable=False)  # created, confirmed, corrected, rejected
    reason = Column(Text, nullable=True)
    previous_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection = relationship("Inspection", back_populates="reviews")
    detection = relationship("Detection", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])

class PriorityRecommendation(Base):
    __tablename__ = "priority_recommendations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=False, index=True)
    finding_id = Column(String(64), ForeignKey("detections.id"), nullable=True)
    factors = Column(JSON, nullable=False)
    recommended = Column(String(64), nullable=False)  # routine_monitoring, low, medium, high, urgent_engineering_review
    confirmed = Column(String(64), nullable=True)
    confirmed_by = Column(String(64), ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection = relationship("Inspection", back_populates="priority_recommendations")
    finding = relationship("Detection")
    confirmer = relationship("User", foreign_keys=[confirmed_by])

class SeverityRule(Base):
    __tablename__ = "severity_rules"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    version = Column(String(32), nullable=False, unique=True)
    weights = Column(JSON, nullable=False)
    thresholds = Column(JSON, nullable=False)
    created_by = Column(String(64), nullable=False)
    is_development_default = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class PriorityRule(Base):
    __tablename__ = "priority_rules"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    version = Column(String(32), nullable=False, unique=True)
    weights = Column(JSON, nullable=False)
    risk_factors = Column(JSON, nullable=False)
    created_by = Column(String(64), nullable=False)
    is_development_default = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class RepairTaskTemplate(Base):
    __tablename__ = "repair_task_templates"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    damage_type = Column(String(64), nullable=False, unique=True)
    suggested_action = Column(Text, nullable=False)
    priority = Column(String(32), default="medium", nullable=False)
    is_development_default = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(String(64), primary_key=True)  # e.g. WO-001
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=False, index=True)
    asset_id = Column(String(64), ForeignKey("assets.id"), nullable=False, index=True)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=True, index=True)
    finding_id = Column(String(64), ForeignKey("detections.id"), nullable=True, index=True)
    action = Column(Text, nullable=False)
    priority = Column(String(32), nullable=False)  # routine_monitoring, low, medium, high, urgent_engineering_review
    assignee_id = Column(String(64), ForeignKey("users.id"), nullable=True, index=True)
    team = Column(String(128), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    repair_window = Column(String(64), nullable=True)
    status = Column(String(32), default="unassigned", nullable=False, index=True)  # unassigned, open, in_progress, closed
    closed_note = Column(Text, nullable=True)
    created_by = Column(String(64), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization = relationship("Organization")
    asset = relationship("Asset", back_populates="work_orders")
    inspection = relationship("Inspection", back_populates="work_orders")
    finding = relationship("Detection")
    assignee = relationship("User", foreign_keys=[assignee_id])
    creator = relationship("User", foreign_keys=[created_by])
    events = relationship("WorkOrderEvent", back_populates="work_order", cascade="all, delete-orphan")

class WorkOrderEvent(Base):
    __tablename__ = "work_order_events"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    work_order_id = Column(String(64), ForeignKey("work_orders.id"), nullable=False, index=True)
    actor_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    from_status = Column(String(32), nullable=False)
    to_status = Column(String(32), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    work_order = relationship("WorkOrder", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])

class InspectionComparison(Base):
    __tablename__ = "inspection_comparisons"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    asset_id = Column(String(64), ForeignKey("assets.id"), nullable=False, index=True)
    inspection_id_1 = Column(String(64), ForeignKey("inspections.id"), nullable=False)
    inspection_id_2 = Column(String(64), ForeignKey("inspections.id"), nullable=False)
    inlier_ratio = Column(Float, nullable=False)
    comparable = Column(Boolean, nullable=False)
    transform = Column(JSON, nullable=True)
    change_summary = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    asset = relationship("Asset")
    inspection_1 = relationship("Inspection", foreign_keys=[inspection_id_1])
    inspection_2 = relationship("Inspection", foreign_keys=[inspection_id_2])

class Report(Base):
    __tablename__ = "reports"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    inspection_id = Column(String(64), ForeignKey("inspections.id"), nullable=False, index=True)
    version = Column(Integer, default=1, nullable=False)
    checksum = Column(String(64), nullable=False)
    file_format = Column(String(16), nullable=False)  # pdf, csv, xlsx, json
    file_path = Column(String(512), nullable=False)
    generated_by = Column(String(64), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    inspection = relationship("Inspection", back_populates="reports")
    generator = relationship("User", foreign_keys=[generated_by])

