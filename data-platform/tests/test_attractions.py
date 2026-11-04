"""Phase 2: attractions from Wikidata go to review, never straight to the public."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.catalog import Attraction, ReviewTask, SourceClaim
from vromon_data import pipeline, review
from vromon_data.connectors.geoboundaries import GeoBoundariesBGD
from vromon_data.connectors.wikidata_attractions import WikidataAttractions


def _b(qid, label, lon, lat, classes, bn=None, image=None, sitelinks=0, desc=None):
    b = {"item": {"value": f"http://www.wikidata.org/entity/{qid}"}, "itemLabel": {"value": label},
         "coord": {"value": f"Point({lon} {lat})"},
         "classes": {"value": " ".join(f"http://www.wikidata.org/entity/{c}" for c in classes)},
         "sitelinks": {"value": str(sitelinks)}}
    if bn:
        b["bn"] = {"value": bn}
    if image:
        b["image"] = {"value": image}
    if desc:
        b["descEn"] = {"value": desc}
    return b


RESPONSES = {"bd-district-barishal": {"results": {"bindings": [
    _b("Q1", "Guthia Mosque", 90.1, 22.1, ["Q32815", "Q1370598"], bn="গুঠিয়া মসজিদ", sitelinks=3, desc="mosque in Barishal"),
    _b("Q2", "Some Taung", 90.2, 22.3, ["Q8502"]),                                    # gazetteer peak: skipped
    _b("Q3", "Q3", 90.15, 22.4, ["Q23397"], bn="দুর্গাসাগর দিঘি", sitelinks=1),          # Bangla label only
    _b("Q4", "Patenga Beach", 90.7, 22.2, ["Q40080"], sitelinks=5),                  # in Chattogram: not this district
    _b("Q5", "Border Park", 90.2495, 22.2, ["Q22698"], sitelinks=1),                 # 50 m from the Bhola border
]}}}


def _setup(session, layers):
    assert pipeline.run(GeoBoundariesBGD(), session, params={"files": layers})["status"] == "succeeded"


def _run(session, dry=False):
    return pipeline.run(WikidataAttractions(), session, dry_run=dry, params={
        "districts": ["bd-district-barishal"], "responses": RESPONSES,
        "portal_spots": {"bd-district-barishal": ["গুঠিয়া মসজিদ", "দুর্গাসাগর"]}})


def test_attractions_wait_for_review(session, layers):
    _setup(session, layers)
    report = _run(session)
    assert report["status"] == "succeeded", report
    assert report["entities_created"] == 3
    assert report["skipped_gazetteer_feature"] == 1
    rows = {a.slug: a for a in session.scalars(select(Attraction))}
    assert set(rows) == {"barishal-guthia-mosque", "barishal-durgasagor-dighi", "barishal-border-park"}
    # Nothing is public: proposed claims only, so curated fields stay empty until a person approves
    assert all(a.status == "needs_review" for a in rows.values())
    assert rows["barishal-guthia-mosque"].canonical_name_en is None
    assert rows["barishal-guthia-mosque"].field_status["canonical_name_en"]["status"] == "needs_review"
    assert session.scalar(select(func.count()).select_from(SourceClaim).where(SourceClaim.entity_type == "attraction",
                                                                             SourceClaim.status == "accepted")) == 0
    tasks = {t.payload.get("name_en") or t.payload.get("name_bn"): t
             for t in session.scalars(select(ReviewTask).where(ReviewTask.task_type == "new_entity"))}
    assert tasks["Guthia Mosque"].payload["official_portal_match"] == "গুঠিয়া মসজিদ"
    assert tasks["Guthia Mosque"].payload["category"] == "religious"
    assert tasks["Border Park"].payload["official_portal_match"] is None
    # The border case also asks for a district check
    assert session.scalar(select(func.count()).select_from(ReviewTask).where(ReviewTask.task_type == "missing_admin_area")) == 1


def test_approval_publishes_with_provenance(session, layers):
    _setup(session, layers)
    _run(session)
    task = session.scalar(select(ReviewTask).where(ReviewTask.task_type == "new_entity",
                                                   ReviewTask.payload["name_en"].as_string() == "Guthia Mosque"))
    review.decide(session, task.id, "approve", reviewer="tester", reason="checked against the portal list")
    a = session.get(Attraction, task.entity_id)
    assert a.status == "published"
    assert a.canonical_name_en == "Guthia Mosque" and a.canonical_name_bn == "গুঠিয়া মসজিদ"
    assert a.category_code == "religious"
    assert a.field_status["latitude"]["status"] == "verified"
    assert a.field_status["latitude"]["source_id"] == "wikidata"
    assert a.field_status["opening_hours"]["status"] == "unknown"     # nobody said: stays unknown
    assert a.entry_fee_amount is None


def test_rerun_does_not_duplicate(session, layers):
    _setup(session, layers)
    _run(session)
    report = _run(session)
    assert report.get("entities_created", 0) == 0
    assert report.get("claims_new", 0) == 0
    assert session.scalar(select(func.count()).select_from(Attraction)) == 3


def test_review_needs_reviewer_and_reason(session, layers):
    import pytest
    _setup(session, layers)
    _run(session)
    task = session.scalar(select(ReviewTask).where(ReviewTask.task_type == "new_entity"))
    with pytest.raises(ValueError):
        review.decide(session, task.id, "approve", reviewer=None, reason=None)


def test_spreadsheet_review_round_trip(session, layers, tmp_path):
    import csv
    _setup(session, layers)
    _run(session)
    out = tmp_path / "review.csv"
    assert review.export_csv(session, out, "new_entity") == 3
    rows = list(csv.DictReader(open(out, encoding="utf-8-sig")))
    for r in rows:
        if r["name_en"] == "Guthia Mosque":
            r["decision"], r["reason"] = "approve", "on the district portal list"
        elif r["name_en"] == "Border Park":
            r["decision"], r["reason"] = "reject", "not a tourist attraction"
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    assert review.import_csv(session, out, "tester") == {"approve": 1, "reject": 1, "defer": 0, "skipped": 1, "errors": 0}
    status = {a.slug: a.status for a in session.scalars(select(Attraction))}
    assert status == {"barishal-guthia-mosque": "published", "barishal-border-park": "rejected",
                      "barishal-durgasagor-dighi": "needs_review"}


def test_photos_need_an_open_licence(session, layers):
    from app.models.catalog import AttractionMedia
    from vromon_data.connectors.commons_media import CommonsMedia
    _setup(session, layers)
    _run(session)
    # Give two attractions images in their Wikidata records
    from app.models.catalog import StagingRecord
    recs = {r.source_record_id: r for r in session.scalars(select(StagingRecord).where(StagingRecord.source_id == "wikidata"))}
    recs["Q1"].raw = {**recs["Q1"].raw, "image": "http://commons.wikimedia.org/wiki/Special:FilePath/Guthia%20Mosque.jpg"}
    recs["Q5"].raw = {**recs["Q5"].raw, "image": "http://commons.wikimedia.org/wiki/Special:FilePath/Park.jpg"}
    session.commit()
    info = {
        "File:Guthia Mosque.jpg": {"descriptionurl": "https://commons.wikimedia.org/wiki/File:Guthia_Mosque.jpg",
                                   "url": "https://upload.wikimedia.org/g.jpg", "width": 800, "height": 600, "sha1": "a" * 40,
                                   "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": "<a>Rahim</a>"}}},
        "File:Park.jpg": {"descriptionurl": "https://commons.wikimedia.org/wiki/File:Park.jpg", "url": "https://upload.wikimedia.org/p.jpg",
                          "extmetadata": {"LicenseShortName": {"value": "Fair use"}}},
    }
    report = pipeline.run(CommonsMedia(), session, params={"imageinfo": info})
    assert report["status"] == "succeeded", report
    media = {m.original_url.rsplit(":", 1)[-1]: m for m in session.scalars(select(AttractionMedia))}
    ok, bad = media["Guthia_Mosque.jpg"], media["Park.jpg"]
    assert ok.approval_status == "auto_approved" and ok.creator == "Rahim" and "CC BY-SA 4.0" in ok.attribution
    assert bad.approval_status == "needs_review"
    assert session.scalar(select(func.count()).select_from(ReviewTask).where(ReviewTask.task_type == "licence")) == 1


def test_duplicates_go_to_review_not_merged(session, layers):
    _setup(session, layers)
    responses = {"bd-district-barishal": {"results": {"bindings": RESPONSES["bd-district-barishal"]["results"]["bindings"] + [
        _b("Q9", "Guthia Masjid", 90.1008, 22.1006, ["Q32815"], bn="গুঠিয়া মসজিদ", sitelinks=1),   # same mosque, 100 m away
        _b("Q10", "Guthia School", 90.1008, 22.1006, ["Q570116"], sitelinks=1),                     # different name
    ]}}}
    report = pipeline.run(WikidataAttractions(), session, params={"districts": ["bd-district-barishal"],
                                                                  "responses": responses, "portal_spots": {}})
    assert report["review_duplicate"] == 1
    assert session.scalar(select(func.count()).select_from(Attraction)) == 5     # both kept
    report = pipeline.run(WikidataAttractions(), session, params={"districts": ["bd-district-barishal"],
                                                                  "responses": responses, "portal_spots": {}})
    assert report.get("review_duplicate", 0) == 0                                 # not opened twice


def test_official_list_links_or_proposes_without_guessing_a_location(session, layers):
    from vromon_data.connectors.portal_spots import PortalTouristSpots
    import json as _json
    from vromon_data.connectors import portal_names
    _setup(session, layers)
    _run(session)
    portal_names.PORTALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    pages = {"bd-district-barishal": {1: '<td class="table-td" data-column="title"> গুঠিয়া মসজিদ, উজিরপুর </td>'
                                         '<td class="table-td" data-column="title"> সাতলা বিল </td>'}}
    import pytest
    mp = pytest.MonkeyPatch()
    mp.setattr(portal_names, "load_portals", lambda: {"Barisal": {"level": "district", "domain": "barisal"}})
    from vromon_data.connectors import portal_spots
    mp.setattr(portal_spots, "load_portals", lambda: {"Barisal": {"level": "district", "domain": "barisal"}})
    report = pipeline.run(PortalTouristSpots(), session, params={"pages": pages, "districts": ["bd-district-barishal"]})
    mp.undo()
    assert report["status"] == "succeeded", report
    assert report["matched_existing"] == 1 and report["new_without_location"] == 1
    new = session.scalar(select(Attraction).where(Attraction.slug.like("barishal-satola%")))
    assert new is not None and new.latitude is None and new.status == "needs_review"
    assert session.scalar(select(func.count()).select_from(ReviewTask).where(ReviewTask.task_type == "location_needed")) == 1
