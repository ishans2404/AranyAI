#!/usr/bin/env python3
"""
AranyAI — Seed ranger assignments
==================================
Assigns existing AOIs to demo ranger names so the Admin/Ranger view
switcher has something to show. Run AFTER scripts/seed_aoi.py.

This is POC role data, not user accounts — see RangerAssignment model
docstring in backend/database.py.

Usage:
  python scripts/seed_rangers.py
  python scripts/seed_rangers.py --url http://localhost:8000
"""
import argparse
import json
from urllib.request import Request, urlopen

DEFAULT_URL = "http://localhost:8080"


def call(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body else None
    req  = Request(url, data=data, method=method,
                   headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args()
    base = args.url.rstrip("/")

    aois = call("GET", f"{base}/api/aois")
    if not aois:
        print("No AOIs found — run scripts/seed_aoi.py first.")
        return

    # Demo assignment: alternate AOIs between two ranger names.
    demo_rangers = ["R. Sharma", "A. Verma"]
    for i, aoi in enumerate(aois):
        ranger = demo_rangers[i % len(demo_rangers)]
        result = call("POST", f"{base}/api/rangers/assign", {
            "ranger_name": ranger,
            "aoi_id": aoi["id"],
        })
        print(f"  {ranger:12} ← {aoi['name']}  ({result['status']})")

    rangers = call("GET", f"{base}/api/rangers")
    print(f"\n{len(rangers)} ranger(s) now assigned — visible in the View switcher.")


if __name__ == "__main__":
    main()