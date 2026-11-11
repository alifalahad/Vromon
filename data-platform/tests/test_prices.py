"""Prices: TCB's daily market sheet, and room rates hotels publish on their own websites."""

from __future__ import annotations

import io
from datetime import date, datetime

from sqlalchemy import func, select

from app.models.catalog import PriceObservation, ReviewTask
from tests.test_attractions import _setup
from tests.test_service_places import ROWS
from vromon_data import pipeline
from vromon_data.connectors.prices import HotelWebsiteRates, TcbRetailPrices, extract_rates, read_tcb_sheet
from vromon_data.connectors.service_places import OvertureServicePlaces


def tcb_sheet(day: str = "০৪-১১-২০২৬", rice: int = 70) -> bytes:
    """Laid out as TCB's sheet: title lines, the memo and date, a two-row header, items, the markets."""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in (["ট্রেডিং কর্পোরেশন অব বাংলাদেশ "], [f"নং-২৬.০৫.০০০০.০১৭.৩১.০১.২৬-৮৮৩        তারিখঃ {day} "],
                ["পণ্যের নাম ", " মাপের একক", "অদ্যকার মূল্য(টাকায়)", None, "১সপ্তাহ পূর্বের মূল্য(টাকায়)"],
                [None, None, datetime(2026, 11, 4), None, datetime(2026, 10, 28)],
                [None, None, "সর্বনিম্ন ", "সর্ব্বোচ্চ ", "সর্বনিম্ন "],
                ["চাল সরু (নাজির/মিনিকেট)", "প্রতি কেজি", rice, 90, 70],
                ["আটা/ময়দা", " "],                                        # a heading, no prices
                ["ইলিশ", "প্রতি কেজি", 0, 0, 0],                          # not in the market today
                ["ডিম (ফার্ম)", "প্রতি হালি", 45, 50, 45],
                ["লেখার কাগজ(সাদা)", "প্রতি দিস্তা", 34, 40, 34],              # not food
                ["যে সকল বাজার হতে তথ্য সংগ্রহ করা হয়েছেঃ-", " মিরপুর-৬, মালিবাগ বাজার। "],
                ["(১)    ময়দা এর মূল্য বৃদ্ধি পেয়েছে।"]):
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_tcb_sheet_reads_items_date_and_markets():
    sheet = read_tcb_sheet(tcb_sheet())
    assert sheet["date"] == date(2026, 11, 4) and sheet["memo"] == "26.05.0000.017.31.01.26-883"
    assert sheet["markets"] == "মিরপুর-৬, মালিবাগ বাজার"
    assert [r[0] for r in sheet["rows"]] == ["চাল সরু (নাজির/মিনিকেট)", "ইলিশ", "ডিম (ফার্ম)", "লেখার কাগজ(সাদা)"]
    assert sheet["rows"][0][1:] == ("প্রতি কেজি", 70.0, 90.0)


def test_tcb_prices_are_written_once_per_day_and_never_flagged_removed(session, layers, tmp_path):
    _setup(session, layers)
    day1, day2 = tmp_path / "tcb-0411.xlsx", tmp_path / "tcb-0511.xlsx"
    day1.write_bytes(tcb_sheet())
    day2.write_bytes(tcb_sheet("০৫-১১-২০২৬", 72))
    report = pipeline.run(TcbRetailPrices(), session, params={"sheets": [["test://tcb-0411.xlsx", str(day1)]]})
    assert report["status"] == "succeeded", report
    assert report["prices_written"] == 2 and report["not_in_market"] == 1 and report["non_food_skipped"] == 1
    rice = session.scalar(select(PriceObservation).where(PriceObservation.item_label.like("চাল%")))
    assert (rice.amount_min, rice.amount_max, rice.price_kind, rice.status) == (70.0, 90.0, "market_retail", "published")
    assert rice.observed_on == date(2026, 11, 4) and "মিরপুর-৬" in rice.area_label
    again = pipeline.run(TcbRetailPrices(), session, params={"sheets": [["test://tcb-0411.xlsx", str(day1)]]})
    assert again["already_recorded"] == 2 and "prices_written" not in again
    # The next day's sheet adds rows; the day before's are history, not "removed from the source"
    pipeline.run(TcbRetailPrices(), session, params={"sheets": [["test://tcb-0511.xlsx", str(day2)]]})
    assert session.scalar(select(func.count()).select_from(PriceObservation)) == 4
    assert session.scalar(select(func.count()).select_from(ReviewTask).where(ReviewTask.task_type == "source_record_removed")) == 0


def test_room_rates_need_a_currency_a_room_and_nothing_else_near():
    page = ("Room Tariffs Deluxe Room TK.5,376.00/- Net $ 50++ Per Night NO OF ROOMS - 14 Book Now Deluxe Twin Room "
            "TK.7,476.00/- Net. For a second child an extra bed @ Tk. 3000 will be charged. Breakfast buffet BDT 950 "
            "per person. Call 01711-234567. Photo Gallery Crown Twin Room Room Tariff : $193 | BDT 21250 Virtual Tours")
    got = {(r["amount"], r["currency"]): (r["label"], r["room_rate"]) for r in extract_rates(page)}
    assert got[(5376.0, "BDT")] == ("Deluxe Room", True)
    assert got[(7476.0, "BDT")] == ("Deluxe Twin Room", True)
    assert got[(3000.0, "BDT")][1] is False                     # extra bed
    assert got[(950.0, "BDT")][1] is False                      # breakfast, per person
    assert got[(21250.0, "BDT")] == ("Crown Twin Room", True)   # "Virtual Tours" after it is page furniture
    assert got[(193.0, "USD")][1] is True
    assert all(a != 234567.0 for a, _ in got)                    # a phone number has no currency


def test_hotel_rates_from_its_own_website(session, layers):
    _setup(session, layers)
    pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})   # Hotel Sea Gull, website https://x.example
    page = "<html><body><h2>Rooms</h2><p>Deluxe Room BDT 4,500 per night</p><p>Extra bed Tk 800</p></body></html>"
    report = pipeline.run(HotelWebsiteRates(), session, params={"pages": {"https://x.example": page}})
    assert report["status"] == "succeeded", report
    assert report.get("rates_published") == 1 and report["hotels_with_published_rate"] == 1, report
    rate = session.scalar(select(PriceObservation).where(PriceObservation.status == "published"))
    assert (rate.amount_min, rate.currency, rate.item_label, rate.price_kind) == (4500.0, "BDT", "Deluxe Room", "rack_rate")
    assert rate.source_url == "https://x.example" and rate.artifact_id is not None and "⟨BDT 4,500⟩" in rate.context
    # Read again: the new reading replaces the old one, which is kept
    page2 = page.replace("4,500", "5,000")
    pipeline.run(HotelWebsiteRates(), session, params={"pages": {"https://x.example": page2}})
    current = session.scalars(select(PriceObservation.amount_min).where(PriceObservation.status == "published")).all()
    assert current == [5000.0]
    assert session.scalar(select(func.count()).select_from(PriceObservation).where(PriceObservation.status == "superseded")) == 2   # the rate and the extra bed kept for review


def test_packages_extra_persons_and_outliers_are_not_room_rates(session, layers):
    page = ("Select a package Couple Day Long — ৳8,555 Corporate Retreat - ৳2,800 Premium Couple Cottage Sea View Max 2 "
            "Extra ( BDT 1,000 /p) BDT 8,500 / Night. Children can stay free in their parent's room. And BDT 1200 All "
            "inclusive per child breakfast charge")
    got = {r["amount"]: r["room_rate"] for r in extract_rates(page)}
    assert got[8555.0] is False and got[2800.0] is False and got[1000.0] is False and got[8500.0] is True
    assert got[1200.0] is False                                 # a child's breakfast
    _setup(session, layers)
    pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    html = ("<p>Deluxe Room BDT 6,000</p><p>Twin Room BDT 7,000</p><p>Suite Room BDT 9,000</p>"
            "<p>Couple Room BDT 900</p>")                      # far below the others
    pipeline.run(HotelWebsiteRates(), session, params={"pages": {"https://x.example": html}})
    published = sorted(session.scalars(select(PriceObservation.amount_min).where(PriceObservation.status == "published")))
    assert published == [6000.0, 7000.0, 9000.0]


def test_prices_on_an_unfinished_template_wait_for_review(session, layers):
    _setup(session, layers)
    pipeline.run(OvertureServicePlaces(), session, params={"rows": ROWS})
    html = "<p>Lorem ipsum dolor sit amet.</p><p>Luxury Single Room 1,500.00 ৳</p>"
    pipeline.run(HotelWebsiteRates(), session, params={"pages": {"https://x.example": html}})
    rate = session.scalar(select(PriceObservation))
    assert rate.status == "needs_review" and "placeholder" in rate.notes
