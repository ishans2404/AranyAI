"""
AranyAI FastAPI backend — all routes.

Run:
  uvicorn backend.main:app --reload --port 8080

Docs:
  http://localhost:8080/docs
"""
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal, Optional

import ee
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import create_access_token, get_current_user, verify_password
from .config import settings
from .database import Alert, AOI, Base, ChangeRun, ChangeVector, RangerAssignment, Site, User, engine, get_session
from .gee_runner import (
    _class_distribution, _composite, _init, DW_PALETTE,
    get_tile_urls, run_gee_detection,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-20s  %(levelname)s  %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="AranyAI API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email:    str
    password: str


class AOICreate(BaseModel):
    name:       str
    division:   Optional[str] = None
    range_name: Optional[str] = None
    geojson:    dict           # GeoJSON Polygon or MultiPolygon


class DetectRequest(BaseModel):
    """
    The server computes its own rolling baseline/current windows (see
    gee_runner.detection_windows) — current_end only matters for
    backtesting against a historical date. Normal operational use just
    POSTs {"mode": "nrt"} and lets it default to today.
    """
    mode:        Literal["nrt", "annual"] = "nrt"
    current_end: Optional[date] = None


class AlertUpdate(BaseModel):
    status:          Optional[Literal["open", "resolved", "dismissed"]] = None
    assigned_to:     Optional[str] = None
    notes:           Optional[str] = None
    # Field-verification outcome — the feedback-loop hook. Distinct from
    # `status`: confirming real change doesn't automatically close the
    # case, the officer still has to act on it.
    officer_outcome: Optional[Literal["confirmed", "false_alarm", "needs_follow_up"]] = None
    officer_reason:  Optional[Literal["cloud_shadow", "harvest", "seasonal_flood", "natural_fall", "other"]] = None
    verified_by:     Optional[str] = None


class RangerAssignCreate(BaseModel):
    ranger_name: str
    aoi_id:      str


# ── Serialization helpers ──────────────────────────────────────────────────────

def _alert_dict(a: Alert) -> dict:
    return {
        "id":                  a.id,
        "aoi_id":              a.aoi_id,
        "run_id":              a.run_id,
        "site_id":             a.site_id,
        "detection_mode":      a.detection_mode,
        "change_type":         a.change_type,
        "severity":            a.severity,
        "area_ha":             a.area_ha,
        "first_detected_at":   str(a.first_detected_at) if a.first_detected_at else None,
        "confidence":          a.confidence,
        "anomaly_z_score":     a.anomaly_z_score,
        "baseline_trees_prob": a.baseline_trees_prob,
        "current_trees_prob":  a.current_trees_prob,
        "persistence_count":   a.persistence_count,
        "explainability":      json.loads(a.explainability_bundle) if a.explainability_bundle else None,
        "status":              a.status,
        "assigned_to":         a.assigned_to,
        "notes":               a.notes,
        "officer_outcome":     a.officer_outcome,
        "officer_reason":      a.officer_reason,
        "verified_at":         str(a.verified_at) if a.verified_at else None,
        "verified_by":         a.verified_by,
        "created_at":          str(a.created_at),
        "resolved_at":         str(a.resolved_at) if a.resolved_at else None,
    }


def _site_dict(s: Site) -> dict:
    precision = (
        round(s.precision_confirmed / s.precision_total, 2)
        if s.precision_total else None
    )
    return {
        "id":                  s.id,
        "aoi_id":              s.aoi_id,
        "change_type":         s.change_type,
        "geojson":             json.loads(s.geom_geojson),
        "status":              s.status,
        "persistence_count":   s.persistence_count,
        "first_detected_at":   str(s.first_detected_at) if s.first_detected_at else None,
        "last_observed_at":    str(s.last_observed_at) if s.last_observed_at else None,
        "precision_confirmed": s.precision_confirmed,
        "precision_total":     s.precision_total,
        "precision":           precision,
    }


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest):
    with get_session() as db:
        user = (
            db.query(User)
            .filter(User.email == body.email.strip().lower(), User.is_active == True)
            .first()
        )
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        user.last_login_at = datetime.utcnow()
        token = create_access_token(user)
        return {
            "token": token,
            "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        }


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "AranyAI", "version": "0.2.0"}


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
    Fast land-cover snapshot for an AOI — no export task, no alerts, no DB
    write. Use this immediately after selecting an AOI so the officer
    sees what's actually there before committing to a full detection run.
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

    label, _, _, count = _composite(aoi, str(start), str(end))
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


# ── Ranger routes (lightweight POC role model — see RangerAssignment) ────────

@app.get("/api/rangers")
def list_rangers():
    """
    Distinct rangers with their assigned AOI ids. Powers the Admin/Ranger
    view switcher and scopes which AOIs a ranger view can select.
    NOT authentication — there is no login behind ranger_name.
    """
    with get_session() as db:
        rows = db.query(RangerAssignment).all()
        out: dict[str, list[str]] = {}
        for r in rows:
            out.setdefault(r.ranger_name, []).append(r.aoi_id)
        return [{"name": name, "aoi_ids": ids} for name, ids in out.items()]


@app.post("/api/rangers/assign", status_code=201)
def assign_ranger(body: RangerAssignCreate):
    """Assign an AOI to a ranger (admin action). Idempotent."""
    with get_session() as db:
        exists = (
            db.query(RangerAssignment)
            .filter(
                RangerAssignment.ranger_name == body.ranger_name,
                RangerAssignment.aoi_id == body.aoi_id,
            )
            .first()
        )
        if exists:
            return {"status": "already_assigned"}
        db.add(RangerAssignment(ranger_name=body.ranger_name, aoi_id=body.aoi_id))
    return {"status": "assigned"}


# ── Detection routes ──────────────────────────────────────────────────────────

@app.post("/api/aois/{aoi_id}/detect", status_code=202)
def trigger_detection(aoi_id: str, req: DetectRequest, bg: BackgroundTasks):
    """
    Start a detection run. Returns immediately — GEE runs in a background
    thread. Poll GET /api/runs/{run_id} for status.
    """
    current_end = str(req.current_end) if req.current_end else str(date.today())

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
            status="running",
        ))

    bg.add_task(
        run_gee_detection,
        run_id=run_id,
        aoi_geojson=geojson,
        current_end=current_end,
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
            "baseline":        f"{run.baseline_start}/{run.baseline_end}" if run.baseline_start else None,
            "current":         f"{run.current_start}/{run.current_end}" if run.current_start else None,
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
    Return GEE tile URLs for the map panel. URLs expire ~2 hours.
    Use ?refresh=true to force regeneration.
    """
    with get_session() as db:
        run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
        if not run:
            raise HTTPException(404, "Run not found")
        if run.status not in ("done", "low_confidence"):
            return {"status": run.status, "message": "Run not complete yet"}

        aoi_row = db.query(AOI).filter(AOI.id == run.aoi_id).first()
        aoi_geojson = json.loads(aoi_row.geojson)

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
        current_start = str(run.current_start)
        current_end  = str(run.current_end)

    _init()
    aoi = ee.Geometry(aoi_geojson)
    c_label, _, _, _ = _composite(aoi, current_start, current_end)
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
    Return all change polygons for this run as a GeoJSON FeatureCollection
    (includes both candidate and promoted clusters — see properties.site_status).
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
        "deforestation":  "#BC6C25",
        "encroachment":   "#DDA15E",
        "agri_in_forest": "#C78448",
        "tree_to_bare":   "#606C38",
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


# ── Site routes ────────────────────────────────────────────────────────────────

@app.get("/api/sites")
def list_sites(
    aoi_id: Optional[str] = None,
    status: Optional[str] = None,
    limit:  int = Query(100, le=300),
):
    """
    Persistent locations — the map's "sites" layer. ?status=candidate
    shows sites still awaiting a confirming pass; ?status=open shows
    promoted, officer-visible sites.
    """
    with get_session() as db:
        q = db.query(Site)
        if aoi_id: q = q.filter(Site.aoi_id == aoi_id)
        if status: q = q.filter(Site.status == status)
        sites = q.order_by(Site.last_observed_at.desc()).limit(limit).all()
        return [_site_dict(s) for s in sites]


@app.get("/api/sites/{site_id}")
def get_site(site_id: str):
    """Site detail with its full alert history — the longitudinal view."""
    with get_session() as db:
        site = db.query(Site).filter(Site.id == site_id).first()
        if not site:
            raise HTTPException(404, "Site not found")
        alerts = (
            db.query(Alert)
            .filter(Alert.site_id == site_id)
            .order_by(Alert.created_at.desc())
            .all()
        )
        out = _site_dict(site)
        out["alerts"] = [_alert_dict(a) for a in alerts]
        return out


@app.get("/api/aois/{aoi_id}/precision")
def aoi_precision(aoi_id: str):
    """
    Per-AOI trust metric: confirmed / total officer outcomes recorded
    across all sites in this AOI. The single number worth showing a DFO —
    more credible than any dashboard polish.
    """
    with get_session() as db:
        sites = db.query(Site).filter(Site.aoi_id == aoi_id).all()
        confirmed = sum(s.precision_confirmed or 0 for s in sites)
        total     = sum(s.precision_total or 0 for s in sites)
        return {
            "aoi_id": aoi_id,
            "confirmed": confirmed,
            "total": total,
            "precision": round(confirmed / total, 3) if total else None,
        }


# ── Alert routes ──────────────────────────────────────────────────────────────

@app.get("/api/alerts")
def list_alerts(
    status:      Optional[str] = None,
    severity:    Optional[str] = None,
    aoi_id:      Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit:       int = Query(50, le=200),
):
    """
    List alerts. Filter with ?status=open&severity=high&aoi_id=...
    Use ?assigned_to=ranger_name for a ranger-scoped view. Sorted by
    confidence first — the queue order officers should triage in.
    """
    with get_session() as db:
        q = db.query(Alert)
        if status:      q = q.filter(Alert.status      == status)
        if severity:    q = q.filter(Alert.severity    == severity)
        if aoi_id:       q = q.filter(Alert.aoi_id      == aoi_id)
        if assigned_to:  q = q.filter(Alert.assigned_to == assigned_to)
        alerts = q.order_by(Alert.confidence.desc(), Alert.created_at.desc()).limit(limit).all()
        return [_alert_dict(a) for a in alerts]


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: str, body: AlertUpdate):
    """
    Update alert status, assign to a ranger, or record a field-verification
    outcome. officer_outcome is the feedback-loop hook: it updates the
    linked Site's precision_confirmed/precision_total, which is what lets
    AranyAI report a real per-AOI trust metric instead of a bare alert count.
    """
    with get_session() as db:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            raise HTTPException(404, "Alert not found")

        site = db.query(Site).filter(Site.id == alert.site_id).first() if alert.site_id else None

        if body.assigned_to is not None:
            alert.assigned_to = body.assigned_to
        if body.notes is not None:
            alert.notes = body.notes

        if body.officer_outcome is not None:
            alert.officer_outcome = body.officer_outcome
            alert.officer_reason  = body.officer_reason
            alert.verified_at     = datetime.utcnow()
            alert.verified_by     = body.verified_by

            if body.officer_outcome in ("confirmed", "false_alarm") and site:
                site.precision_total = (site.precision_total or 0) + 1
                if body.officer_outcome == "confirmed":
                    site.precision_confirmed = (site.precision_confirmed or 0) + 1

            if body.officer_outcome == "false_alarm":
                alert.status = "dismissed"
                if site:
                    site.status = "false_alarm"

        if body.status is not None:
            alert.status = body.status
            if body.status == "resolved":
                alert.resolved_at = datetime.utcnow()
                if site:
                    site.status = "resolved"
            elif body.status == "dismissed" and site:
                site.status = "false_alarm"

    return _alert_dict(alert)