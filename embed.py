#!/usr/bin/env python3
"""
data.json validator and audience-reference checker.

The HTML now loads data.json via fetch() directly — no inline embedding needed.
Run this after editing data.json to catch broken audience IDs or JSON errors
before refreshing the browser.

Usage: python3 embed.py
"""
import json, sys

DATA_FILE = "data.json"

try:
    with open(DATA_FILE) as f:
        data = json.load(f)
except FileNotFoundError:
    print(f"Error: {DATA_FILE} not found"); sys.exit(1)
except json.JSONDecodeError as e:
    print(f"Error: invalid JSON — {e}"); sys.exit(1)

audience_keys = set(data["meta"]["audiences"].keys())
broken = []

for d in data["deliverables"]:
    for fld in ["clientAudience", "internalReceiver"]:
        for v in d.get(fld, []):
            if v not in audience_keys:
                broken.append((d["id"], d["title"], fld, v))

total = len(data["deliverables"])
with_skills = sum(1 for d in data["deliverables"] if d.get("skills"))

print(f"✓ {DATA_FILE} valid JSON — {total} deliverables, {len(audience_keys)} audience IDs")
print(f"  {with_skills}/{total} deliverables have skills assigned")

if broken:
    print(f"\n  ✗ {len(broken)} broken audience reference(s):")
    for b in broken:
        print(f"    [{b[0]}] {b[1]} — {b[2]}: {repr(b[3])}")
    sys.exit(1)
else:
    print(f"  ✓ All audience references valid")
