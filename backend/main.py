"""
AranyAI FastAPI backend — all routes.

Run:
  uvicorn backend.main:app --reload --port 8000

Docs:
  http://localhost:8000/docs
"""
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal, Optional

import ee
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .database import Alert, AOI, Base, ChangeRun, ChangeVector, engine, get_session
from .gee_runner import (
    _class_distribution, _composite, _init, annual_windows, DW_PALETTE,
    get_tile_urls, nrt_windows, run_gee_detection,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-20s  %(levelname)s  %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="AranyAI API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # lock down in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request schemas ───────────────────────────────────────────────────────────

class AOICreate(BaseModel):
    name:       str
    division:   Optional[str] = None
    range_name: Optional[str] = None
    geojson:    dict           # GeoJSON Polygon or MultiPolygon


class DetectRequest(BaseModel):
    baseline_start: date
    baseline_end:   date
    current_start:  date
    current_end:    date
    mode:           Literal["nrt", "annual", "custom"] = "nrt"


class AlertUpdate(BaseModel):
    status:      Optional[Literal["open", "assigned", "resolved", "dismissed"]] = None
    assigned_to: Optional[str] = None
    notes:       Optional[str] = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "AranyAI", "version": "0.1.0"}


# ── AOI routes ────────────────────────────────────────────────────────────────

@app.post("/api/aois", status_code=201)
def create_aoi(body: AOICreate):
    """Register a new area of interest."""
    aoi_id = str(uuid.uuid4())
    with get_session() as db:
        db.add(AOI(
            id=aoi_id,
            name=body.name,
            division=body.division,
            range_name=body.range_name,
            geojson=json.dumps(body.geojson),
        ))
    return {"id": aoi_id, "name": body.name}


@app.get("/api/aois")
def list_aois():
    with get_session() as db:
        rows = db.query(AOI).filter(AOI.is_active == True).all()
        return [
            {"id": r.id, "name": r.name, "division": r.division,
             "range_name": r.range_name, "created_at": str(r.created_at)}
            for r in rows
        ]


@app.get("/api/aois/{aoi_id}")
def get_aoi(aoi_id: str):
    with get_session() as db:
        aoi = db.query(AOI).filter(AOI.id == aoi_id).first()
        if not aoi:
            raise HTTPException(404, "AOI not found")
        return {
            "id":         aoi.id,
            "name":       aoi.name,
            "division":   aoi.division,
            "range_name": aoi.range_name,
            "geojson":    json.loads(aoi.geojson),
        }


@app.get("/api/aois/{aoi_id}/preview")
def preview_aoi(aoi_id: str, days: int = 30):
    """
    Fast land-cover snapshot for an AOI — no export task, no alerts, no DB write.
    Use this immediately after selecting an AOI so the officer sees what's
    actually there (tree %, crop %, built %...) before committing to a full
    NRT/annual detection run, which is slower and creates a GCS export task.

    Returns class_distribution (ha per DW class) and a clipped DW tile URL
    for the last `days` days (default 30).
    """
    with get_session() as db:
        aoi_row = db.query(AOI).filter(AOI.id == aoi_id).first()
        if not aoi_row:
            raise HTTPException(404, "AOI not found")
        geojson = json.loads(aoi_row.geojson)

    _init()
    aoi = ee.Geometry(geojson)
    end   = datetime.utcnow().date()
    start = end - timedelta(days=days)

    label, _, count = _composite(aoi, str(start), str(end))
    if count == 0:
        return {
            "image_count":  0,
            "window":       f"{start}/{end}",
            "message":      "No clear Dynamic World images in this window — "
                            "try a longer window or check for monsoon cloud cover.",
            "aoi_geojson":  geojson,
        }

    distribution = _class_distribution(label, aoi)

    tile_url = None
    try:
        vis = {"min": 0, "max": 8, "palette": DW_PALETTE}
        tile_url = label.clip(aoi).visualize(**vis).getMapId()["tile_fetcher"].url_format
    except Exception as exc:
        logging.getLogger("aranyai.api").warning("preview tile failed: %s", exc)

    return {
        "image_count":        count,
        "window":             f"{start}/{end}",
        "class_distribution": distribution,
        "dw_tile_url":        tile_url,
        "aoi_geojson":        geojson,
    }


# ── Detection routes ──────────────────────────────────────────────────────────

@app.post("/api/aois/{aoi_id}/detect", status_code=202)
def trigger_detection(aoi_id: str, req: DetectRequest, bg: BackgroundTasks):
    """
    Start a change detection run.
    Returns immediately — GEE runs in a background thread.
    Poll GET /api/runs/{run_id} for status.
    """
    with get_session() as db:
        aoi = db.query(AOI).filter(AOI.id == aoi_id).first()
        if not aoi:
            raise HTTPException(404, "AOI not found")
        geojson = json.loads(aoi.geojson)

        run_id = str(uuid.uuid4())
        db.add(ChangeRun(
            id=run_id,
            aoi_id=aoi_id,
            detection_mode=req.mode,
            baseline_start=req.baseline_start,
            baseline_end=req.baseline_end,
            current_start=req.current_start,
            current_end=req.current_end,
            status="running",
        ))

    bg.add_task(
        run_gee_detection,
        run_id=run_id,
        aoi_geojson=geojson,
        baseline_start=str(req.baseline_start),
        baseline_end=str(req.baseline_end),
        current_start=str(req.current_start),
        current_end=str(req.current_end),
        mode=req.mode,
    )

    return {
        "run_id": run_id,
        "status": "running",
        "poll":   f"/api/runs/{run_id}",
    }


@app.get("/api/aois/{aoi_id}/runs")
def list_runs(aoi_id: str):
    """Return detection history for an AOI (newest first)."""
    with get_session() as db:
        runs = (
            db.query(ChangeRun)
            .filter(ChangeRun.aoi_id == aoi_id)
            .order_by(ChangeRun.run_at.desc())
            .limit(20)
            .all()
        )
        return [
            {
                "id":                run.id,
                "status":            run.status,
                "detection_mode":    run.detection_mode,
                "run_at":            str(run.run_at),
                "any_change_ha":     run.any_change_ha,
                "deforestation_ha":  run.deforestation_ha,
            }
            for run in runs
        ]


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    """
    Poll run status and get area statistics.
    status: pending | running | done | failed | low_confidence
    """
    with get_session() as db:
        run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
        if not run:
            raise HTTPException(404, "Run not found")
        return {
            "id":              run.id,
            "aoi_id":          run.aoi_id,
            "status":          run.status,
            "detection_mode":  run.detection_mode,
            "baseline":        f"{run.baseline_start}/{run.baseline_end}",
            "current":         f"{run.current_start}/{run.current_end}",
            "baseline_images": run.baseline_images,
            "current_images":  run.current_images,
            "areas_ha": {
                "deforestation":  run.deforestation_ha,
                "encroachment":   run.encroachment_ha,
                "agri_in_forest": run.agri_in_forest_ha,
                "tree_to_bare":   run.tree_to_bare_ha,
                "any_change":     run.any_change_ha,
            },
            "raster_gcs":             run.raster_path,
            "gee_task_ids":           json.loads(run.gee_task_ids or "{}"),
            "class_distribution":     json.loads(run.class_distribution or "{}"),
            "baseline_distribution":  json.loads(run.baseline_distribution or "{}"),
        }


@app.get("/api/runs/{run_id}/tiles")
def get_run_tiles(run_id: str, refresh: bool = False):
    """
    Return GEE tile URLs for the map panel.
    URLs expire ~2 hours. Use ?refresh=true to force regeneration.

    Returns:
      dw_label   — DW classification overlay (XYZ tile URL)
      before_s2  — Sentinel-2 before change
      after_s2   — Sentinel-2 after change
      aoi_geojson — AOI polygon for the map
    """
    with get_session() as db:
        run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
        if not run:
            raise HTTPException(404, "Run not found")
        if run.status not in ("done", "low_confidence"):
            return {"status": run.status, "message": "Run not complete yet"}

        aoi_row = db.query(AOI).filter(AOI.id == run.aoi_id).first()
        aoi_geojson = json.loads(aoi_row.geojson)

        # Return cached tiles if still valid
        now = datetime.utcnow()
        if (
            not refresh
            and run.dw_tile_url
            and run.tile_expires_at
            and run.tile_expires_at > now
        ):
            return {
                "dw_label":   run.dw_tile_url,
                "before_s2":  run.before_tile_url,
                "after_s2":   run.after_tile_url,
                "aoi_geojson": aoi_geojson,
                "expires_at": str(run.tile_expires_at),
                "cached":     True,
            }

        baseline_end = str(run.baseline_end)
        current_end  = str(run.current_end)

    # Regenerate tile URLs (they expired)
    _init()
    aoi = ee.Geometry(aoi_geojson)
    c_label, _, _ = _composite(aoi, str(run.current_start), str(run.current_end))
    urls = get_tile_urls(aoi, baseline_end, current_end, c_label)

    expires = datetime.utcnow() + timedelta(hours=2)
    with get_session() as db:
        r = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
        r.dw_tile_url     = urls["dw_label"]
        r.before_tile_url = urls["before_s2"]
        r.after_tile_url  = urls["after_s2"]
        r.tile_expires_at = expires

    return {
        "dw_label":    urls["dw_label"],
        "before_s2":   urls["before_s2"],
        "after_s2":    urls["after_s2"],
        "aoi_geojson": aoi_geojson,
        "expires_at":  str(expires),
        "cached":      False,
    }


@app.get("/api/runs/{run_id}/vectors")
def get_run_vectors(run_id: str):
    """
    Return all change polygons for this run as a GeoJSON FeatureCollection.
    Use as a Mapbox vector source.
    """
    with get_session() as db:
        run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
        if not run:
            raise HTTPException(404, "Run not found")

        vectors = (
            db.query(ChangeVector)
            .filter(ChangeVector.run_id == run_id)
            .all()
        )

    features = []
    COLORS = {
        "deforestation":  "#dc2626",
        "encroachment":   "#f97316",
        "agri_in_forest": "#eab308",
        "tree_to_bare":   "#8b5cf6",
    }

    for v in vectors:
        fc = json.loads(v.geojson)
        for feat in fc.get("features", []):
            feat.setdefault("properties", {}).update({
                "change_type": v.change_type,
                "color":       COLORS.get(v.change_type, "#6b7280"),
                "run_id":      run_id,
            })
            features.append(feat)

    return {"type": "FeatureCollection", "features": features}


# ── Alert routes ──────────────────────────────────────────────────────────────

@app.get("/api/alerts")
def list_alerts(
    status:   Optional[str] = None,
    severity: Optional[str] = None,
    aoi_id:   Optional[str] = None,
    limit:    int = Query(50, le=200),
):
    """
    List alerts. Filter with ?status=open&severity=high&aoi_id=...
    """
    with get_session() as db:
        q = db.query(Alert)
        if status:   q = q.filter(Alert.status   == status)
        if severity: q = q.filter(Alert.severity == severity)
        if aoi_id:   q = q.filter(Alert.aoi_id   == aoi_id)
        alerts = q.order_by(Alert.created_at.desc()).limit(limit).all()

        return [
            {
                "id":                a.id,
                "aoi_id":            a.aoi_id,
                "run_id":            a.run_id,
                "detection_mode":    a.detection_mode,
                "change_type":       a.change_type,
                "severity":          a.severity,
                "area_ha":           a.area_ha,
                "first_detected_at": str(a.first_detected_at) if a.first_detected_at else None,
                "confidence":        a.confidence,
                "status":            a.status,
                "assigned_to":       a.assigned_to,
                "notes":             a.notes,
                "created_at":        str(a.created_at),
                "resolved_at":       str(a.resolved_at) if a.resolved_at else None,
            }
            for a in alerts
        ]


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: str, body: AlertUpdate):
    """Update alert status, assign to ranger, or add notes."""
    with get_session() as db:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            raise HTTPException(404, "Alert not found")
        if body.status is not None:
            alert.status = body.status
            if body.status == "resolved":
                alert.resolved_at = datetime.utcnow()
        if body.assigned_to is not None:
            alert.assigned_to = body.assigned_to
        if body.notes is not None:
            alert.notes = body.notes
    return {"id": alert.id, "status": alert.status, "assigned_to": alert.assigned_to}
