"""Phases 4-5: hubs and the railway timetable."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.catalog import ReviewTask, TimetableVersion, TransportHub, TrainService
from tests.test_attractions import _setup
from vromon_data import pipeline, review
from vromon_data.connectors.hubs import OsmHubsBD, OurAirportsBD
from vromon_data.connectors.railway import parse_row
from vromon_data.pdftext import reorder

CSV = ("id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,iata_code\n"
       "1,VGBR,medium_airport,Barisal Airport,22.8,90.3,BD,Barisal,yes,BZL\n"
       "2,VGXX,small_airport,Old Strip,22.1,90.1,BD,,no,\n"
       "3,VECC,large_airport,Kolkata,22.6,88.4,IN,Kolkata,yes,CCU\n")


def test_parse_intercity_and_commuter_rows():
    assert parse_row("১। ৭০৫ একতা এক্সপ্রেস - ঢাকা 1015 পঞ্চগড় 2100", True) == \
        ("১", "৭০৫", "একতা এক্সপ্রেস", "-", "ঢাকা", "1015", "পঞ্চগড়", "2100")
    assert parse_row("৩। ৭১৩ করতোয়া এক্সপ্রেস বুধবার সান্তাহার 0925 বুড়িমারী 1600", True)[3] == "বুধবার"
    # No off-day column: a multi-word origin is recognised from the known station names
    row = parse_row("৬৯। ৩১৩১ মিতালী এক্সপ্রেস ঢাকা ক্যান্টঃ 2150 নিউ জলপাইগুড়ি ০৭৪৫", False, frozenset({"ঢাকা ক্যান্টঃ"}))
    assert row[2:5] == ("মিতালী এক্সপ্রেস", None, "ঢাকা ক্যান্টঃ") and row[6] == "নিউ জলপাইগুড়ি"
    assert parse_row("ক্রঃ নং ট্রেন নং", True) is None


def test_visual_order_is_restored():
    assert reorder("েসামবার") == "সোমবার"   # ে+সা → সো
    assert reorder("িচলাহাটি") == "চিলাহাটি"


def test_airports_with_scheduled_service_only(session, layers):
    _setup(session, layers)
    report = pipeline.run(OurAirportsBD(), session, params={"csv": CSV})
    assert report["status"] == "succeeded" and report["entities_created"] == 1
    hub = session.scalar(select(TransportHub))
    assert hub.iata_code == "BZL" and hub.status == "published" and hub.district_id is not None
    assert hub.field_status["latitude"]["source_id"] == "ourairports"


def test_osm_hubs_need_a_name_and_a_type(session, layers):
    _setup(session, layers)
    data = {"elements": [
        {"type": "node", "id": 1, "lat": 22.1, "lon": 90.1, "tags": {"railway": "station", "name": "বরিশাল", "name:en": "Barisal", "alt_name": "বরিশাল"}},
        {"type": "way", "id": 2, "center": {"lat": 22.2, "lon": 90.3}, "tags": {"amenity": "bus_station", "name": "Bhola Bus Terminal"}},
        {"type": "node", "id": 3, "lat": 22.1, "lon": 90.1, "tags": {"railway": "station"}},
    ]}
    report = pipeline.run(OsmHubsBD(), session, params={"overpass": data})
    assert report["status"] == "succeeded" and report["entities_created"] == 2
    assert report["skipped_unnamed_or_untyped"] == 1
    types = dict(session.execute(select(TransportHub.hub_type, func.count()).group_by(TransportHub.hub_type)).all())
    assert types == {"railway_station": 1, "bus_terminal": 1}


def test_timetable_version_publishes_only_after_sample_check(session):
    from app.models.catalog import TransportOperator
    op = TransportOperator(slug="bangladesh-railway", operator_type="railway")
    session.add(op)
    session.flush()
    v = TimetableVersion(operator_id=op.id, name="Time table no. 54", zone="west", status="needs_review")
    session.add(v)
    session.flush()
    from app.models.catalog import Train
    t = Train(operator_id=op.id, train_number="705")
    session.add(t)
    session.flush()
    session.add(TrainService(timetable_version_id=v.id, train_id=t.id, status="needs_review", field_status={}))
    task = ReviewTask(task_type="timetable_sample", entity_type="timetable_version", entity_id=v.id, payload={})
    session.add(task)
    session.commit()
    review.decide(session, task.id, "approve", reviewer="tester", reason="12 rows match the PDF")
    assert session.get(TimetableVersion, v.id).status == "published"
    assert session.scalar(select(TrainService.status)) == "published"


def test_journeys_are_calculations_with_their_engine(session, layers):
    from app.models.catalog import JourneyCalculation
    from app.models.models import City, Country
    from vromon_data.connectors.journeys import DistrictJourneys
    _setup(session, layers)
    session.add(Country(iso2="BD", name="Bangladesh"))
    session.flush()
    session.add_all([City(geonameid=1, country_iso2="BD", name="Barisal", lat=22.2, lon=90.1, population=300000),
                     City(geonameid=2, country_iso2="BD", name="Bhola", lat=22.2, lon=90.4, population=100000)])
    session.commit()
    matrix = [{"sources_from": 0, "km": [[0, 35.2], [36.0, 0]], "minutes": [[0, 70], [None, 0]]}]
    report = pipeline.run(DistrictJourneys(), session, params={"matrix": matrix})
    assert report["status"] == "succeeded" and report["journeys"] == 2
    rows = {(j.origin_ref, j.destination_ref): j for j in session.scalars(select(JourneyCalculation))}
    j = rows[("admin_unit:bd-district-barishal", "admin_unit:bd-district-bhola")]
    assert j.distance_km == 35.2 and j.is_estimate and j.engine == "openrouteservice"
    assert rows[("admin_unit:bd-district-bhola", "admin_unit:bd-district-barishal")].duration_min is None  # unknown, not guessed
    assert report["errors_fetch"] == 1   # Chattogram has no town in the fixture


def test_transcribed_fares_need_their_chart(session, tmp_path):
    from app.models.catalog import FareProduct
    from vromon_data.connectors.transcribed_fares import COLUMNS, TranscribedFares
    f = tmp_path / "brta.csv"
    f.write_text(",".join(COLUMNS) + "\n"
                 "bus,ঢাকা,বরিশাল,পদ্মা সেতু,non_ac_seat,no,51,464,180,2026-09-22,https://brta.gov.bd/x.pdf,3,Rahim,\n"
                 "bus,ঢাকা,বরিশাল,,non_ac_seat,no,40,,,,https://brta.gov.bd/x.pdf,3,Rahim,\n", encoding="utf-8")
    report = pipeline.run(TranscribedFares(), session, params={"file": str(f), "source_id": "bd_brta"})
    assert report["status"] == "succeeded" and report["fares_written"] == 1 and report["rejected"] == 1
    fare = session.scalar(select(FareProduct))
    assert fare.fare_type == "regulated" and fare.vehicle_seats == 51 and fare.status == "needs_review"
    assert fare.verification_method == "human_transcription"
