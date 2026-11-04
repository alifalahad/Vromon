"""
Vromon data platform: provenance and the curated catalog (docs/DATASET_IMPLEMENTATION_PLAN.md).

Written by the pipeline in data-platform/ (vromon_data), read by the API. Everything
here is new; the app's existing tables are untouched (the publish adapter feeds `places`).

Provenance, in the order data moves:
  data_sources        the registry (data-platform/source-registry/sources.yaml)
  source_artifacts    one immutable raw file or response, with its sha256
  ingestion_jobs      one connector run (dry runs are rolled back and leave no rows)
  staging_records     parsed + normalized records with a hash for change detection
  source_claims       one fact about one field of one entity, from one source
  review_tasks        anything a person must decide; verification_events is the audit log

Curated values are resolved from accepted claims (vromon_data.claims.resolve), so a bad
import is undone by rejecting its job's claims and resolving again.

Geometry is GeoJSON text in EPSG:4326, simplified with the tolerance recorded; the full
geometry stays in the raw artifact (artifact + feature id). PostGIS can be added later.
"""

from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

class DataSource(Base):
    __tablename__ = "data_sources"

    source_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_name: Mapped[str] = mapped_column(String(300), nullable=False)
    organization: Mapped[str] = mapped_column(String(300), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    website_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    dataset_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    access_method: Mapped[str] = mapped_column(String(40), nullable=False)
    fetch_policy: Mapped[str] = mapped_column(String(20), nullable=False, default="robots")
    usage_policy_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    license_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    license_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    attribution_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    terms_review_status: Mapped[str] = mapped_column(String(30), nullable=False)
    coverage: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    update_frequency: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reliability_class: Mapped[str] = mapped_column(String(30), nullable=False)
    recommended_use: Mapped[str] = mapped_column(String(20), nullable=False)
    last_successful_fetch: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_human_review: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    connector: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    connector_version: Mapped[str] = mapped_column(String(20), nullable=False)
    source_id: Mapped[str] = mapped_column(String(64), ForeignKey("data_sources.source_id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")  # running / succeeded / failed / rolled_back
    params: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    counts: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class IngestionJobError(Base):
    __tablename__ = "ingestion_job_errors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String(20), nullable=False)  # fetch / parse / normalize / validate / match / publish
    source_record_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SourceArtifact(Base):
    """An exact downloaded file or response. Never edited; the bytes live under data-platform/raw/."""
    __tablename__ = "source_artifacts"
    __table_args__ = (UniqueConstraint("source_id", "sha256", name="uq_source_artifacts_source_sha"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    source_id: Mapped[str] = mapped_column(String(64), ForeignKey("data_sources.source_id"), nullable=False, index=True)
    uri: Mapped[str] = mapped_column(String(1000), nullable=False)  # URL, or manual://<original filename>
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)  # relative to the raw directory
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    license_snapshot: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    first_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class StagingRecord(Base):
    __tablename__ = "staging_records"
    __table_args__ = (
        Index("ix_staging_source_record", "source_id", "entity_type", "source_record_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(200), nullable=False)
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("source_artifacts.id"), nullable=True)
    record_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)          # source-native values (geometry left out)
    normalized: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    validation_errors: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    change: Mapped[str] = mapped_column(String(12), nullable=False)               # added / changed / unchanged
    status: Mapped[str] = mapped_column(String(20), nullable=False)               # valid / invalid / review
    target_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SourceClaim(Base):
    """One source's value for one field of one entity (guideline §6.2)."""
    __tablename__ = "source_claims"
    __table_args__ = (
        Index("ix_claims_entity_field", "entity_type", "entity_id", "field_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    field_name: Mapped[str] = mapped_column(String(60), nullable=False)
    claimed_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)   # {"v": value}; None = the source says nothing
    source_id: Mapped[str] = mapped_column(String(64), ForeignKey("data_sources.source_id"), nullable=False, index=True)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    source_published_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verification_method: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # official_source / human_check / spatial_check …
    confidence: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")  # high / medium / low
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="proposed")    # proposed / accepted / rejected / superseded
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("ingestion_jobs.id"), nullable=True, index=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class EntityExternalId(Base):
    __tablename__ = "entity_external_ids"
    __table_args__ = (
        UniqueConstraint("entity_type", "provider", "external_id", name="uq_external_id"),
        Index("ix_external_ids_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)   # geoboundaries / iso3166-2 / wikidata / osm / hdx_pcode …
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class EntityName(Base):
    """Names in any language (plan D7): official, common, alias, transliteration, historical."""
    __tablename__ = "entity_names"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "lang", "name", name="uq_entity_names"),
        Index("ix_entity_names_entity", "entity_type", "entity_id"),
        Index("ix_entity_names_match", "match_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    lang: Mapped[str] = mapped_column(String(10), nullable=False)       # bn / en / bn-Latn …
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)       # official / common / alias / historical
    match_key: Mapped[str] = mapped_column(String(300), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class ReviewTask(Base):
    __tablename__ = "review_tasks"
    __table_args__ = (Index("ix_review_tasks_open", "status", "task_type"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # duplicate / new_entity / coordinate_conflict / name_conflict / missing_admin_area / fare_conflict /
    # schedule_change / licence / image_match / source_record_removed / geometry
    entity_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    related_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=2, nullable=False)  # 1 high … 3 low
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open")  # open / approved / rejected / deferred
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    reviewer: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    decision: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class VerificationEvent(Base):
    """Audit log: every human or automated decision that changed a curated value or status."""
    __tablename__ = "verification_events"
    __table_args__ = (Index("ix_verification_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    field_name: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    old_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    method: Mapped[str] = mapped_column(String(40), nullable=False)   # review / rollback / resolve / human_check
    reviewer: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Administrative geography
# ---------------------------------------------------------------------------

class AdminUnit(Base):
    """Country → division → district → upazila/thana → union … (levels, not per-country tables)."""
    __tablename__ = "admin_units"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_admin_units_slug"),
        Index("ix_admin_units_level", "country_iso2", "level"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    country_iso2: Mapped[str] = mapped_column(String(2), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # country / division / district / upazila / thana / union …
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True, index=True)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_bn: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    centroid_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    centroid_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    area_km2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="imported")
    field_status: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AdminBoundary(Base):
    __tablename__ = "admin_boundaries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    admin_unit_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("admin_units.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("source_artifacts.id"), nullable=True)
    feature_ref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)   # feature id inside the artifact
    geometry_geojson: Mapped[str] = mapped_column(Text, nullable=False)             # simplified, EPSG:4326
    simplify_tolerance_deg: Mapped[float] = mapped_column(Float, nullable=False)
    min_lon: Mapped[float] = mapped_column(Float, nullable=False)
    min_lat: Mapped[float] = mapped_column(Float, nullable=False)
    max_lon: Mapped[float] = mapped_column(Float, nullable=False)
    max_lat: Mapped[float] = mapped_column(Float, nullable=False)
    was_repaired: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AdminAdjacency(Base):
    """Neighbouring units, computed from shared borders (never from text)."""
    __tablename__ = "admin_adjacency"
    __table_args__ = (UniqueConstraint("unit_id", "neighbor_id", name="uq_admin_adjacency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("admin_units.id", ondelete="CASCADE"), nullable=False, index=True)
    neighbor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("admin_units.id", ondelete="CASCADE"), nullable=False)
    shared_border_km: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(60), nullable=False)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


# ---------------------------------------------------------------------------
# Attractions (guideline §3.2; "destinations" there, but `destinations` already means a trip town here)
# ---------------------------------------------------------------------------

class AttractionCategory(Base):
    """Vromon's attraction categories, with the app category the trip planner uses (`app_category`)."""
    __tablename__ = "attraction_categories"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    name_bn: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    app_category: Mapped[str] = mapped_column(String(50), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Attraction(Base):
    __tablename__ = "attractions"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_attractions_slug"),
        Index("ix_attractions_district_status", "district_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    country_iso2: Mapped[str] = mapped_column(String(2), nullable=False, default="BD")
    canonical_name_en: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    canonical_name_bn: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    category_code: Mapped[Optional[str]] = mapped_column(String(40), ForeignKey("attraction_categories.code"), nullable=True)
    subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    district_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    subdistrict_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    locality: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_precision: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # point / area_centre / approximate
    description_en: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description_bn: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    short_description_en: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    short_description_bn: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    entry_fee_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_fee_currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    entry_fee_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    opening_hours: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    best_visit_months: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)       # [10, 11, 12, 1, 2, 3]
    recommended_visit_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # hours
    accessibility_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visitor_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_information: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    official_website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    heritage_designation: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    field_status: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AttractionMedia(Base):
    """An image with its licence (guideline §8). Not shown until `approval_status` is approved."""
    __tablename__ = "attraction_media"
    __table_args__ = (UniqueConstraint("attraction_id", "original_url", name="uq_attraction_media_url"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    attraction_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("attractions.id", ondelete="CASCADE"), nullable=False, index=True)
    original_url: Mapped[str] = mapped_column(String(1000), nullable=False)    # the file page
    file_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    thumb_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    creator: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    license: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    license_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    attribution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sha1: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)      # Commons publishes SHA-1
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    caption_lang: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="primary")   # primary / secondary / illustrative
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


# ---------------------------------------------------------------------------
# Transport (guideline §3.3-3.6): hubs, operators, trains, timetables, fares, journeys
# ---------------------------------------------------------------------------

class TransportOperator(Base):
    __tablename__ = "transport_operators"
    __table_args__ = (UniqueConstraint("slug", name="uq_transport_operators_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_bn: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    operator_type: Mapped[str] = mapped_column(String(30), nullable=False)  # railway / bus / airline / launch / ferry / boat
    website: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")


class TransportHub(Base):
    __tablename__ = "transport_hubs"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_transport_hubs_slug"),
        Index("ix_transport_hubs_type_district", "hub_type", "district_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    # railway_station / railway_halt / bus_terminal / airport / ferry_terminal
    hub_type: Mapped[str] = mapped_column(String(30), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_bn: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    division_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    district_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    subdistrict_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    iata_code: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="imported")
    field_status: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class TimetableVersion(Base):
    """One published timetable (e.g. Bangladesh Railway time table no. 54); kept, never overwritten."""
    __tablename__ = "timetable_versions"
    __table_args__ = (UniqueConstraint("operator_id", "name", "zone", name="uq_timetable_versions"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    operator_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("transport_operators.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    zone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)            # east / west
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("source_artifacts.id"), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    timezone: Mapped[str] = mapped_column(String(40), nullable=False, default="Asia/Dhaka")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Train(Base):
    __tablename__ = "trains"
    __table_args__ = (UniqueConstraint("operator_id", "train_number", name="uq_trains_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    operator_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("transport_operators.id"), nullable=False)
    train_number: Mapped[str] = mapped_column(String(20), nullable=False)
    name_bn: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    train_class: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)   # intercity / mail / commuter / international


class TrainService(Base):
    """One train in one direction under one timetable version. The reverse direction is its own row."""
    __tablename__ = "train_services"
    __table_args__ = (UniqueConstraint("timetable_version_id", "train_id", name="uq_train_services"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    timetable_version_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("timetable_versions.id"), nullable=False, index=True)
    train_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("trains.id"), nullable=False)
    origin_hub_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_hubs.id"), nullable=True)
    destination_hub_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_hubs.id"), nullable=True)
    origin_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)         # as printed
    destination_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    departure_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)        # HH:MM, Asia/Dhaka
    arrival_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    arrival_day_offset: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)      # 1 = next day
    off_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)                 # 0=Mon … 6=Sun
    off_day_text: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    runs_daily: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    field_status: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ServiceStop(Base):
    __tablename__ = "service_stops"
    __table_args__ = (UniqueConstraint("service_id", "sequence", name="uq_service_stops_seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("train_services.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    hub_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_hubs.id"), nullable=True)
    stop_name: Mapped[str] = mapped_column(String(200), nullable=False)
    arrival_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    departure_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    day_offset: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_page: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class FareProduct(Base):
    """One fare for one class between two points, with its kind (guideline §3.5): never one unexplained number."""
    __tablename__ = "fare_products"
    __table_args__ = (Index("ix_fare_products_route", "mode", "origin_name", "destination_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)                 # train / bus / air / launch / ferry
    operator_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_operators.id"), nullable=True)
    origin_hub_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_hubs.id"), nullable=True)
    destination_hub_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("transport_hubs.id"), nullable=True)
    origin_name: Mapped[str] = mapped_column(String(200), nullable=False)        # as printed
    destination_name: Mapped[str] = mapped_column(String(200), nullable=False)
    fare_class: Mapped[str] = mapped_column(String(60), nullable=False)          # e.g. shovan_chair, snigdha, ac_seat
    fare_class_label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    ac: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    vehicle_seats: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)                 # what the passenger pays
    base_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vat_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BDT")
    one_way: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # official_operator / regulated / operator_published / platform_displayed / human_confirmed / historical / estimated
    fare_type: Mapped[str] = mapped_column(String(30), nullable=False)
    official_distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # as the fare chart states it
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("source_artifacts.id"), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    source_page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    verification_method: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class JourneyCalculation(Base):
    """A calculated road journey (guideline §3.4): a calculation with its engine and network, never an official fact."""
    __tablename__ = "journey_calculations"
    __table_args__ = (UniqueConstraint("origin_ref", "destination_ref", "mode", "engine", "network_version",
                                       name="uq_journey_calculations"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    origin_ref: Mapped[str] = mapped_column(String(200), nullable=False)        # admin_unit:<slug> / hub:<slug>
    destination_ref: Mapped[str] = mapped_column(String(200), nullable=False)
    origin_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origin_lon: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lat: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lon: Mapped[float] = mapped_column(Float, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)               # road
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duration_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    engine: Mapped[str] = mapped_column(String(40), nullable=False)             # openrouteservice / osrm / straight_line
    profile: Mapped[str] = mapped_column(String(40), nullable=False)
    network_version: Mapped[str] = mapped_column(String(80), nullable=False)
    is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


# ---------------------------------------------------------------------------
# Local foods and products (guideline §3.7) and map exports (§7.5)
# ---------------------------------------------------------------------------

class LocalFood(Base):
    """A district speciality with official evidence: a registered Geographical Indication (DPDT)."""
    __tablename__ = "local_foods"
    __table_args__ = (UniqueConstraint("slug", name="uq_local_foods_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    name_bn: Mapped[str] = mapped_column(String(300), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_food: Mapped[bool] = mapped_column(Boolean, nullable=False)  # food or agricultural product (Nice 29-32; 31 includes seeds, jute)
    nice_classes: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    district_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=True)  # None: national
    district_evidence: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # product_name / applicant / national
    gi_application_no: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    gi_registration_no: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    gi_application_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    applicant: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("source_artifacts.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)


class MapExport(Base):
    """One generated district map, with every input version (guideline §7.4 step 17)."""
    __tablename__ = "map_exports"
    __table_args__ = (UniqueConstraint("district_id", "language", "variant", "sha256", name="uq_map_exports"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    district_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("admin_units.id"), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(5), nullable=False)
    variant: Mapped[str] = mapped_column(String(20), nullable=False)               # final / draft
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    template_version: Mapped[str] = mapped_column(String(40), nullable=False)
    credits: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="needs_review")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
