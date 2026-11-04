"""
Phase 0 source probe: open every `probe` URL in the registry and record what is
really there (status, type, size, robots.txt, and a few source-specific facts such
as licences in API metadata). The result is evidence for docs/SOURCE_CATALOG.md:
no source is called available without a successful probe or official documentation.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from vromon_data import http, registry
from vromon_data.paths import PLATFORM_DIR

RESULTS_FILE = PLATFORM_DIR / "source-registry" / "probe-results.json"
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def _facts(source_id: str, url: str, r: httpx.Response) -> dict[str, Any]:
    """Source-specific details worth recording."""
    out: dict[str, Any] = {}
    ctype = r.headers.get("content-type", "")
    if "json" in ctype:
        try:
            data = r.json()
        except ValueError:
            return out
        if source_id == "geoboundaries_bgd":
            out = {k: data.get(k) for k in ("boundaryID", "boundaryType", "boundaryLicense", "licenseDetail",
                                             "boundarySource", "boundaryYearRepresented", "sourceDataUpdateDate",
                                             "buildDate", "admUnitCount", "gjDownloadURL")}
        elif source_id == "hdx_cod_ab_bgd":
            res = data.get("result", {})
            out = {
                "license": res.get("license_title"),
                "dataset_date": res.get("dataset_date"),
                "last_modified": res.get("last_modified"),
                "resources": [{"name": x.get("name"), "format": x.get("format"), "url": x.get("download_url") or x.get("url")}
                              for x in res.get("resources", [])][:20],
            }
    elif "html" in ctype:
        m = _TITLE.search(r.text)
        if m:
            out["title"] = " ".join(m.group(1).split())[:200]
        if source_id == "bd_district_portals":
            m = re.search(r"মোট\s*([০-৯0-9]+)\s*এন্ট্রি", r.text)
            out["entries_text"] = m.group(0) if m else None
            out["copyright_all_rights_reserved"] = "সর্বস্বত্ব সংরক্ষিত" in r.text
        if source_id == "bd_railway":
            out["pdf_links"] = sorted(set(re.findall(r"https?://[^\"' ]+\.pdf", r.text)))[:10]
    elif "pdf" in ctype:
        out["pdf_bytes"] = len(r.content)
    return out


def probe_url(c: httpx.Client, source_id: str, url: str, fetch_policy: str = "robots") -> dict[str, Any]:
    row: dict[str, Any] = {"source_id": source_id, "url": url, "fetch_policy": fetch_policy}
    try:
        row["robots_allowed"] = http.robots_allows(c, url)
        if not row["robots_allowed"] and fetch_policy == "robots":
            row["result"] = "blocked_by_robots"
            return row
        r = http.get(c, url, check_robots=False)
        row.update(status=r.status_code, final_url=str(r.url), content_type=r.headers.get("content-type"),
                   bytes=len(r.content), last_modified=r.headers.get("last-modified"))
        row["result"] = "ok" if r.status_code == 200 else f"http_{r.status_code}"
        if r.status_code == 200:
            row["facts"] = _facts(source_id, url, r)
    except httpx.HTTPError as e:
        row["result"] = "error"
        row["error"] = f"{type(e).__name__}: {str(e)[:200]}"
    return row


def run(write: bool = True) -> list[dict[str, Any]]:
    sources = registry.load()
    rows: list[dict[str, Any]] = []
    with http.client(timeout=45) as c:
        for s in sources:
            for url in s.get("probe") or []:
                row = probe_url(c, s["source_id"], url, s.get("fetch_policy", "robots"))
                rows.append(row)
                print(f"{row['result']:>18}  {s['source_id']:<24} {url}")
    if write:
        RESULTS_FILE.write_text(json.dumps({
            "probed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            # The contact part of the User-Agent stays out of committed files
            "user_agent": http.USER_AGENT.replace(http.BOT_CONTACT, "<contact>") if http.BOT_CONTACT else http.USER_AGENT,
            "results": rows,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows
