"""Hotels and restaurants: Overture listings by confidence, official star ratings from the ministry list."""

from __future__ import annotations

from sqlalchemy import select

from app.models.catalog import ServicePlace
from tests.test_attractions import _setup
from vromon_data import pipeline
from vromon_data.connectors.service_places import MocatStarHotels, OvertureServicePlaces


def _row(i, name, cat, conf, lat=22.1, lon=90.1):
    return {"id": f"o{i}", "name": name, "names_common": None, "category": cat, "confidence": conf, "operating_status": None,
            "websites": ["https://x.example"], "phones": None, "addresses": [{"freeform": "Sadar Road", "locality": "Barishal"}],
            "brand": None, "datasets": ["meta"], "lat": lat, "lon": lon}


ROWS = [_row(1, "Hotel Sea Gull", "hotel", 0.95), _row(2, "Hotel Sea Gull", "hotel", 0.9),          # duplicate listing
        _row(3, "Kacchi Bhai", "restaurant", 0.75), _row(4, "Tiny Stall", "restaurant", 0.4),        # review / skipped
        _row(5, "Across the Border Inn", "inn", 0.9, lat=23.5, lon=95.0)]                            # not in Bangladesh


def test_listings_by_confidence(session, layers):
    _setup(session, layers)
    report = pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    assert report["status"] == "succeeded", report
    assert report["skipped_duplicate"] == 1 and report["skipped_low_confidence"] == 1 and report["skipped_outside_bangladesh"] == 1
    got = {p.name_en: (p.kind, p.status) for p in session.scalars(select(ServicePlace))}
    assert got == {"Hotel Sea Gull": ("accommodation", "published"), "Kacchi Bhai": ("food", "needs_review")}
    hotel = session.scalar(select(ServicePlace).where(ServicePlace.name_en == "Hotel Sea Gull"))
    assert hotel.field_status["latitude"]["source_id"] == "overture_places" and hotel.official_star_rating is None


def test_official_star_rating_matches_by_name_in_district(session, layers):
    from vromon_data.connectors.admin_names import CuratedAdminNames
    _setup(session, layers)
    pipeline.run(CuratedAdminNames(), session)   # Bangla district names, used to read the official addresses
    pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    page = ("<div>তারকা মানঃ পাঁচ তারকা ১. সী-গাল হো­টেল লিমিটেড হোটেল-মোটেল জোন, বরিশাল। "
            "২. নতুন প্যালেস হোটেল ১২ নং সদর রোড, বরিশাল।</div>")
    report = pipeline.run(MocatStarHotels(), session, params={"pages": {5: page, 4: "<div></div>", 3: "<div></div>"}})
    assert report["status"] == "succeeded", report
    assert report["matched_listing"] == 1 and report["added_without_location"] == 1
    hotel = session.scalar(select(ServicePlace).where(ServicePlace.name_en == "Hotel Sea Gull"))
    assert hotel.official_star_rating == 5 and hotel.field_status["official_star_rating"]["status"] == "verified"
    new = session.scalar(select(ServicePlace).where(ServicePlace.official_star_rating == 5, ServicePlace.latitude.is_(None)))
    assert new is not None and new.status == "needs_review"


def test_official_entry_splits_into_name_and_address():
    from vromon_data.connectors.service_places import split_entry
    cases = {
        "হোটেল ৭১ লিঃ ১৭৬, শহীদ সৈয়দ নজরুল ইসলাম স্মরনী, বিজয় নগর, ঢাকা": "হোটেল ৭১ লিঃ",     # a number in the name
        "লং বীচ হোটেল লিঃ ১৪ কলাতলী রোড, হোটেল-মোটেল জোন, কক্সবাজার": "লং বীচ হোটেল লিঃ",       # "beach" in the name
        "সারাহ রিসোর্ট রাজাবাড়ি, রাজেন্দ্রপুর, শ্রীপুর, গাজীপুর": "সারাহ রিসোর্ট",
        "রেডিশন ব্লু বে ভিউ এস এস খালেদ রোড, লালখান বাজার, চট্রগ্রাম": "রেডিশন ব্লু বে ভিউ",
        "গ্লোবাল এসেট লিমিটেড এর “গ্র্যান্ড সিলেট হোটেল এন্ড রিসোর্ট” বড়শালা, এয়ারপোর্ট রোড, সিলেট": "গ্র্যান্ড সিলেট হোটেল এন্ড রিসোর্ট",
        "হোটেল সুইট ড্রীম ৬০, কামাল আতাতুর্ক এভিনিউ, বনানী, ঢাকা": "হোটেল সুইট ড্রীম",
    }
    for entry, name in cases.items():
        assert split_entry(entry)[0] == name, entry
    assert split_entry("হোটেল সুইট ড্রীম ৬০, কামাল আতাতুর্ক এভিনিউ, বনানী, ঢাকা")[1].startswith("৬০, কামাল")


def test_hotel_names_match_as_a_whole():
    from types import SimpleNamespace as L
    from vromon_data.connectors.service_places import best_listing
    def match(name, *listings):
        best, _, _ = best_listing(name, [L(name_en=n, name_bn=None) for n in listings])
        return best.name_en if best else None
    assert match("লো মেরিডিয়ান ঢাকা", "Dhaka,shakil International Hotel", "Le Meridien Dhaka") == "Le Meridien Dhaka"
    assert match("লং বীচ হোটেল লিঃ", "Hotel Inani Long Bay") is None             # one word of a longer name
    assert match("হোটেল সী-ক্রাউন", "Hotel Sea Queen", "Hotel Sea King") is None   # short names: one letter apart
    assert match("ইন্টারকন্টিনেন্টাল ঢাকা", "InterContinental Dhaka by IHG") == "InterContinental Dhaka by IHG"
    assert match("হোটেল পূর্বানী ইন্টারন্যাশনাল লিঃ", "Hotel Purbani International") == "Hotel Purbani International"


def test_district_comes_from_the_end_of_the_address(session, layers):
    from vromon_data.admin_lookup import AdminLookup
    from vromon_data.connectors.admin_names import CuratedAdminNames
    from vromon_data.connectors.service_places import find_district
    _setup(session, layers)
    pipeline.run(CuratedAdminNames(), session)
    units = list(AdminLookup(session).units.values())
    assert find_district("ভোলা রোড, বরিশাল।", units).name_en == "Barishal"        # not Bhola: the road is named after it
    assert find_district("সদর রোড, বরিশল", units).name_en == "Barishal"            # misspelt


def test_one_listing_two_official_entries_is_neither(session, layers):
    from vromon_data.connectors.admin_names import CuratedAdminNames
    _setup(session, layers)
    pipeline.run(CuratedAdminNames(), session)
    pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    page = ("<div>তারকা মানঃ ১. সী-গাল হোটেল লিমিটেড হোটেল-মোটেল জোন, বরিশাল। "
            "২. সী-গাল হোটেল লিঃ ১২ নং সদর রোড, বরিশাল।</div>")
    report = pipeline.run(MocatStarHotels(), session, params={"pages": {5: page, 4: "<div></div>", 3: "<div></div>"}})
    assert report["shared_listing"] == 2 and report.get("matched_listing", 0) == 0
    hotel = session.scalar(select(ServicePlace).where(ServicePlace.name_en == "Hotel Sea Gull"))
    assert hotel.official_star_rating is None


def test_rollback_does_not_restore_claims_from_the_same_job(session, layers):
    import uuid
    from datetime import datetime
    from sqlalchemy import func
    from app.models.catalog import SourceClaim
    from vromon_data import claims
    from vromon_data.rollback import rollback_job
    _setup(session, layers)
    report = pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    job_id = uuid.UUID(report["job_id"])
    hotel = session.scalar(select(ServicePlace).where(ServicePlace.name_en == "Hotel Sea Gull"))
    for name in ("সী-গাল", "সী গাল হোটেল"):   # one run claiming a field twice: the second supersedes the first
        claims.add_claim(session, entity_type="service_place", entity_id=hotel.id, field="name_bn", value=name,
                         source_id="overture_places", status="accepted", retrieved_at=datetime.utcnow(), job_id=job_id)
        session.flush()
    session.commit()
    rollback_job(session, job_id, reason="test")
    assert session.scalar(select(func.count()).select_from(SourceClaim).where(
        SourceClaim.job_id == job_id, SourceClaim.status.in_(("accepted", "proposed")))) == 0


def test_address_names_wait_for_review_and_duplicates_open_tasks(session, layers):
    from app.models.catalog import ReviewTask
    from vromon_data.connectors.service_places import name_is_address
    assert name_is_address("তালতলী মুরগিবাজার, শ্রীপুর, গাজীপুর")
    assert not name_is_address("Chondu Hotel, Bissoroad, Comilla") and not name_is_address("Hotel Sea Gull")
    _setup(session, layers)
    rows = ROWS + [_row(6, "Dhaka Bus Stand, Kamar Para, Barishal.", "hotel", 0.95, lat=22.2),
                   _row(7, "Jheel Restaurant", "restaurant", 0.9, lat=22.3), _row(8, "ঝিল রেস্তোরা", "restaurant", 0.9, lat=22.3008)]
    report = pipeline.run(OvertureServicePlaces(), session, params={"rows": rows})
    assert report["name_looks_like_address"] == 1 and report["duplicate_tasks_opened"] == 1
    status = {p.name_en or p.name_bn: p.status for p in session.scalars(select(ServicePlace))}
    assert status["Dhaka Bus Stand, Kamar Para, Barishal."] == "needs_review" and status["Jheel Restaurant"] == "published"
    task = session.scalar(select(ReviewTask).where(ReviewTask.task_type == "duplicate"))
    assert {task.payload["record_a"], task.payload["record_b"]} == {"Jheel Restaurant", "ঝিল রেস্তোরা"}
    again = pipeline.run(OvertureServicePlaces(), session, params={"rows": rows})
    assert again.get("duplicate_tasks_opened", 0) == 0      # not opened twice
