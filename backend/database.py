"""
SQLAlchemy models.
Uses SQLite by default (zero setup for local dev).
Set DATABASE_URL=postgresql://user:pass@host/db in .env for production.
"""
import uuid
from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, DateTime, Float,
                        Integer, String, Text, create_engine)
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

_connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
engine   = create_engine(settings.database_url, connect_args=_connect_args)
_Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base     = declarative_base()


@contextmanager
def get_session():
    db = _Session()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Models ────────────────────────────────────────────────────────────────────

class AOI(Base):
    __tablename__ = "aois"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String, nullable=False)
    division   = Column(String)
    range_name = Column(String)
    geojson    = Column(Text, nullable=False)   # GeoJSON string, EPSG:4326
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChangeRun(Base):
    __tablename__ = "change_runs"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id            = Column(String, nullable=False)
    detection_mode    = Column(String, default="nrt")   # nrt | annual | custom
    baseline_start    = Column(Date)
    baseline_end      = Column(Date)
    current_start     = Column(Date)
    current_end       = Column(Date)
    run_at            = Column(DateTime, default=datetime.utcnow)
    # pending | running | done | failed | low_confidence
    status            = Column(String, default="pending")
    baseline_images   = Column(Integer)
    current_images    = Column(Integer)
    gee_task_ids      = Column(Text)            # JSON {"raster": "task_id"}
    # Area statistics in hectares
    deforestation_ha  = Column(Float)
    encroachment_ha   = Column(Float)
    agri_in_forest_ha = Column(Float)
    tree_to_bare_ha   = Column(Float)
    any_change_ha     = Column(Float)
    # GCS path to COG GeoTIFF raster
    raster_path       = Column(String)
    # GEE tile URLs (expire ~2 h; refreshed on demand)
    dw_tile_url            = Column(Text)
    before_tile_url        = Column(Text)
    after_tile_url         = Column(Text)
    tile_expires_at        = Column(DateTime)
    # Land cover class breakdown (JSON: {class_name: area_ha})
    class_distribution     = Column(Text)   # current period
    baseline_distribution  = Column(Text)   # baseline period


class Alert(Base):
    """
    One officer-visible detection at a Site. Created/refreshed only once
    a Site's persistence requirement is met (see gee_runner.PERSISTENCE_REQUIRED)
    — a Site can exist for runs as a 'candidate' with no Alert at all.
    """
    __tablename__ = "alerts"
    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id           = Column(String, nullable=False)
    run_id           = Column(String, nullable=False)
    site_id          = Column(String)            # persistent location — see Site
    detection_mode   = Column(String)
    # deforestation | encroachment | agri_in_forest | tree_to_bare
    change_type      = Column(String, nullable=False)
    # low | medium | high | critical
    severity         = Column(String, nullable=False)
    area_ha          = Column(Float)
    first_detected_at = Column(Date)   # Site.first_detected_at at promotion time
    # 0-100 anomaly-based confidence score (see gee_runner._compute_confidence).
    # NOT a classifier probability — weighted from anomaly magnitude,
    # persistence count, cluster size, and NDVI agreement.
    confidence       = Column(Float)
    anomaly_z_score      = Column(Float)   # raw z = (current - baseline_median) / baseline_stdDev
    baseline_trees_prob  = Column(Float)
    current_trees_prob   = Column(Float)
    persistence_count    = Column(Integer, default=1)
    # JSON: {timeseries, before_tile_url, after_tile_url, dw_tile_url, caption}
    explainability_bundle = Column(Text)
    # open | resolved | dismissed  (lifecycle stage — distinct from officer_outcome)
    status           = Column(String, default="open")
    assigned_to      = Column(String)
    notes            = Column(Text)
    # Officer field-verification outcome — the feedback-loop hook.
    # confirmed | false_alarm | needs_follow_up
    officer_outcome  = Column(String)
    # cloud_shadow | harvest | seasonal_flood | natural_fall | other (set when officer_outcome=false_alarm)
    officer_reason   = Column(String)
    verified_at      = Column(DateTime)
    verified_by      = Column(String)
    created_at       = Column(DateTime, default=datetime.utcnow)
    resolved_at      = Column(DateTime)


class Site(Base):
    """
    Persistent physical location for a detected anomaly. An Alert is the
    officer-visible record at a Site once persistence is confirmed; the
    Site itself tracks lifecycle state and accumulated officer-verification
    precision across however many runs/alerts have touched this location.
    """
    __tablename__ = "sites"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id      = Column(String, nullable=False)
    # Latest classification — descriptive only, can shift between runs
    # (e.g. cleared first, built on later) while remaining the same site.
    change_type = Column(String, nullable=False)
    geom_geojson = Column(Text, nullable=False)   # latest polygon estimate, GeoJSON Polygon, EPSG:4326
    # candidate (detected once, not yet persistence-confirmed) |
    # open (persistence-confirmed, visible to officers) |
    # resolved | false_alarm (officer closed it out)
    status      = Column(String, default="candidate")
    persistence_count  = Column(Integer, default=1)
    first_detected_at  = Column(DateTime, default=datetime.utcnow)
    last_observed_at   = Column(DateTime, default=datetime.utcnow)
    # Precision tracking — confirmed / total officer outcomes recorded.
    # Surfaced as a per-AOI trust metric ("87% of checked alerts were real").
    precision_confirmed = Column(Integer, default=0)
    precision_total     = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)


class ChangeVector(Base):
    """Polygon geometries for changed areas (one row per change type per run)."""
    __tablename__ = "change_vectors"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id      = Column(String, nullable=False)
    change_type = Column(String, nullable=False)
    geojson     = Column(Text, nullable=False)   # GeoJSON FeatureCollection string
    created_at  = Column(DateTime, default=datetime.utcnow)


class RangerAssignment(Base):
    """
    Which AOIs a named ranger can see. This is a lightweight POC role
    model, NOT authentication — there is no login or session tied to
    ranger_name, anyone can pick any view in the UI. It exists only to
    demonstrate the admin/ranger dashboard split. Replace with a real
    users table + auth (login, sessions, server-enforced permissions)
    before any non-demo deployment.
    """
    __tablename__ = "ranger_assignments"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ranger_name = Column(String, nullable=False)
    aoi_id      = Column(String, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
