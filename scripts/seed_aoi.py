#!/usr/bin/env python3
"""
AranyAI — Seed script
=====================
Registers the Jharsuguda/CG-border test AOI and optionally triggers
a first NRT detection run.

Usage (from project root):
  python scripts/seed_aoi.py
  python scripts/seed_aoi.py --detect    # also trigger detection
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

# Test AOI — 8.07 km² polygon near 82°E, 20.3°N (Jharsuguda / CG border)
TEST_AOI = {
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
    parser.add_argument("--detect", action="store_true",  help="Trigger first detection run")
    args = parser.parse_args()

    base = args.url.rstrip("/")

    # ── Health check ──────────────────────────────────────────────────────────
    print(f"Connecting to {base}…")
    try:
        h = call("GET", f"{base}/health")
        print(f"  ✓ Backend alive — {h}")
    except URLError as exc:
        print(f"  ✗ Cannot reach backend: {exc}")
        print("  Is uvicorn running?  →  uvicorn backend.main:app --port 8080")
        sys.exit(1)

    # ── Register AOI ──────────────────────────────────────────────────────────
    print("\nRegistering AOI…")
    aoi = call("POST", f"{base}/api/aois", TEST_AOI)
    aoi_id = aoi["id"]
    print(f"  ✓ AOI created")
    print(f"    id   : {aoi_id}")
    print(f"    name : {aoi['name']}")

    # ── Optionally trigger detection ──────────────────────────────────────────
    if args.detect:
        print("\nTriggering NRT detection…")
        windows = nrt_windows()
        print(f"  Baseline : {windows['baseline_start']} → {windows['baseline_end']}")
        print(f"  Current  : {windows['current_start']}  → {windows['current_end']}")
        run = call("POST", f"{base}/api/aois/{aoi_id}/detect", windows)
        print(f"  ✓ Run queued")
        print(f"    run_id : {run['run_id']}")
        print(f"    status : {run['status']}")
        print(f"\n  Poll status:")
        print(f"    GET {base}/api/runs/{run['run_id']}")
        print(f"\n  GEE task will take ~2–5 minutes to complete.")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"""
──────────────────────────────────────────
  AOI ID (save this):
  {aoi_id}

  Useful API calls:
  GET  {base}/api/aois
  GET  {base}/api/aois/{aoi_id}
  POST {base}/api/aois/{aoi_id}/detect
  GET  {base}/api/alerts

  Interactive docs:
  {base}/docs
──────────────────────────────────────────
""")


if __name__ == "__main__":
    main()
