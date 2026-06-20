#!/usr/bin/env python3
"""
AranyAI — Seed script
=====================
Registers test AOIs and optionally triggers a first NRT detection run.

Two AOIs are available:
  jharsuguda  — industrial/mining area (your original test AOI).
                Mostly crops/bare/built. Good for testing the pipeline
                mechanics, but structurally CANNOT trigger deforestation,
                encroachment, or tree_to_bare alerts — there's no tree
                cover for those transitions to start from.
  forest      — ~29 km² box within the [82.3-82.7E, 20.9-21.2N] region
                you already validated has Dynamic World coverage in your
                Cloud Shell tests (test_dynamicworld.py / export_test.py).
                This is forested, so it can actually exercise the
                deforestation/tree_to_bare/agri_in_forest alert paths.
                NOTE: this is an approximate bounding box, not an official
                sanctuary boundary. Replace with your real forest division
                shapefile/GeoJSON once you have it from the department.

Usage (from project root):
  python scripts/seed_aoi.py                  # seeds both AOIs
  python scripts/seed_aoi.py --only forest     # seed just one
  python scripts/seed_aoi.py --detect          # also trigger detection on each
  python scripts/seed_aoi.py --url http://localhost:8000
"""
import argparse
import json
import sys
from datetime import date, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_URL = "http://localhost:8080"

AOIS = {
    "jharsuguda": {
        "name":       "Jharsuguda Test AOI",
        "division":   "Sambalpur Forest Division",
        "range_name": "Jharsuguda Range",
        "geojson": {
            "type": "Polygon",
            "coordinates": [[
                [82.01577749337133, 20.335431270896603],
                [82.01663580025610, 20.324445193656153],
                [82.02993955696996, 20.320179326967374],
                [82.05212678994116, 20.321789101800736],
                [82.04852190102514, 20.329998692885390],
                [82.03998174752172, 20.342070829220410],
                [82.03285780037817, 20.346376329734404],
                [82.01736536110815, 20.344565619836230],
                [82.01577749337133, 20.335431270896603],
            ]],
        },
    },
    "forest": {
        "name":       "Forest Test AOI (CG/Odisha border belt)",
        "division":   "Sambalpur Forest Division",
        "range_name": "Unverified — replace with actual range",
        "geojson": {
            "type": "Polygon",
            "coordinates": [[
                [82.45, 21.00],
                [82.50, 21.00],
                [82.50, 21.05],
                [82.45, 21.05],
                [82.45, 21.00],
            ]],
        },
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def call(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body else None
    req  = Request(url, data=data, method=method,
                   headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def nrt_windows(days: int = 15) -> dict:
    today = date.today()
    return {
        "mode":           "nrt",
        "current_end":    str(today),
        "current_start":  str(today - timedelta(days=days)),
        "baseline_end":   str(today - timedelta(days=days)),
        "baseline_start": str(today - timedelta(days=days * 2)),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url",    default=DEFAULT_URL, help="Backend base URL")
    parser.add_argument("--detect", action="store_true",  help="Trigger detection on each seeded AOI")
    parser.add_argument("--only",   choices=list(AOIS.keys()), default=None,
                        help="Seed only this AOI (default: seed both)")
    args = parser.parse_args()

    base = args.url.rstrip("/")
    keys = [args.only] if args.only else list(AOIS.keys())

    # ── Health check ──────────────────────────────────────────────────────────
    print(f"Connecting to {base}…")
    try:
        h = call("GET", f"{base}/health")
        print(f"  ✓ Backend alive — {h}")
    except URLError as exc:
        print(f"  ✗ Cannot reach backend: {exc}")
        print("  Is uvicorn running?  →  uvicorn backend.main:app --port 8080")
        sys.exit(1)

    created_ids = {}

    for key in keys:
        aoi_def = AOIS[key]
        print(f"\nRegistering '{key}'…")
        aoi = call("POST", f"{base}/api/aois", aoi_def)
        aoi_id = aoi["id"]
        created_ids[key] = aoi_id
        print(f"  ✓ {aoi['name']}")
        print(f"    id : {aoi_id}")

        # Quick preview — land cover snapshot, no export task
        try:
            preview = call("GET", f"{base}/api/aois/{aoi_id}/preview")
            if preview.get("image_count", 0) > 0:
                dist = preview.get("class_distribution", {})
                tree_ha = dist.get("trees", 0)
                total = sum(dist.values()) or 1
                print(f"    preview: {tree_ha:.1f} ha trees "
                      f"({tree_ha/total*100:.0f}% of {total:.1f} ha total)")
            else:
                print(f"    preview: {preview.get('message', 'no data')}")
        except Exception as exc:
            print(f"    preview: skipped ({exc})")

        if args.detect:
            print(f"  Triggering NRT detection…")
            windows = nrt_windows()
            run = call("POST", f"{base}/api/aois/{aoi_id}/detect", windows)
            print(f"    run_id : {run['run_id']}")
            print(f"    poll   : GET {base}/api/runs/{run['run_id']}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"""
──────────────────────────────────────────
  AOI IDs (save these):
{chr(10).join(f"  {k:12} {v}" for k, v in created_ids.items())}

  Useful API calls:
  GET  {base}/api/aois
  GET  {base}/api/aois/AOI_ID/preview
  POST {base}/api/aois/AOI_ID/detect
  GET  {base}/api/alerts

  Interactive docs:
  {base}/docs

  Tip: run --only forest to exercise deforestation/tree_to_bare alerts.
  The jharsuguda AOI has near-zero tree cover and cannot trigger those
  alert types — that's expected, not a bug.
──────────────────────────────────────────
""")


if __name__ == "__main__":
    main()