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
    dw_tile_url       = Column(Text)
    before_tile_url   = Column(Text)
    after_tile_url    = Column(Text)
    tile_expires_at   = Column(DateTime)


class Alert(Base):
    __tablename__ = "alerts"
    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id           = Column(String, nullable=False)
    run_id           = Column(String, nullable=False)
    detection_mode   = Column(String)
    # deforestation | encroachment | agri_in_forest | tree_to_bare
    change_type      = Column(String, nullable=False)
    # low | medium | high | critical
    severity         = Column(String, nullable=False)
    area_ha          = Column(Float)
    first_detected_at = Column(Date)   # from DW time-series scan
    confidence       = Column(Float)   # mean DW top-class prob 0-1
    # open | assigned | resolved | dismissed
    status           = Column(String, default="open")
    assigned_to      = Column(String)
    notes            = Column(Text)
    created_at       = Column(DateTime, default=datetime.utcnow)
    resolved_at      = Column(DateTime)


class ChangeVector(Base):
    """Polygon geometries for changed areas (one row per change type per run)."""
    __tablename__ = "change_vectors"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id      = Column(String, nullable=False)
    change_type = Column(String, nullable=False)
    geojson     = Column(Text, nullable=False)   # GeoJSON FeatureCollection string
    created_at  = Column(DateTime, default=datetime.utcnow)
