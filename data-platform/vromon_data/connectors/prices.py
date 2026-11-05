"""
Prices (guideline §3.5, §3.7): each a price observation with its kind, source and date, never merged.

  tcb_retail_prices    Trading Corporation of Bangladesh: the daily retail prices of essential foods
                       in Dhaka city (rice, flour, oil, lentils, onion, fish, meat, eggs …), lowest and
                       highest, from the spreadsheet TCB publishes each day with its memo number and the
                       markets surveyed. Official; published as printed. Non-food rows (paper, steel rod)
                       and items not in the market that day (both prices 0) are left out.
  hotel_website_rates  Room rates a hotel publishes on its own website (the listing's website, not a
                       booking platform or social page). The homepage and up to four of its rooms /
                       tariff pages are read, robots.txt respected, including any opt-out for AI agents.
                       A price counts as a room rate only with a currency next to it, a room word near it
                       (deluxe, suite, twin, couple …) and nothing near it that makes it something else
                       (extra bed, breakfast, per person, transfer …). Those are published as "on the
                       hotel's website", with the words around them; anything less certain waits for
                       review. A rate a hotel publishes may be out of date: the date it was read is kept.

hotels.gov.bd (Parjatan's own hotels and motels) is not read: its robots.txt shuts out AI agents.
"""

from __future__ import annotations

import html
import io
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy import select

from app.models.catalog import AdminUnit, PriceObservation, ServicePlace
from vromon_data import http
from vromon_data.pipeline import Connector, Context, Record
from vromon_data.text import clean

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# --- TCB ---------------------------------------------------------------------------------------

TCB_LIST = "https://tcb.gov.bd/pages/daily-rmps"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_XLSX_LINK = re.compile(r"https://objectstorage[^\"'\s<>]+\.xlsx")
NON_FOOD = ("কাগজ", "রড")


def read_tcb_sheet(content: bytes) -> dict[str, Any]:
    """{date, memo, markets, rows: [(item, unit, lowest, highest)]} from one daily sheet."""
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True).worksheets[0]
    out: dict[str, Any] = {"date": None, "memo": None, "markets": None, "rows": []}
    col = None
    for row in ws.iter_rows(values_only=True):
        cells = list(row)
        first = str(cells[0]).strip() if cells and cells[0] is not None else ""
        if out["date"] is None:
            m = re.search(r"তারিখঃ?\s*([০-৯0-9]{1,2})-([০-৯0-9]{1,2})-([০-৯0-9]{4})", first)
            if m:
                d, mo, y = (int(x.translate(_BN_DIGITS)) for x in m.groups())
                out["date"] = date(y, mo, d)
                memo = re.search(r"নং-\s*([০-৯0-9.\-]+)", first)
                out["memo"] = memo.group(1).translate(_BN_DIGITS) if memo else None
        if first.startswith("পণ্যের নাম"):
            col = next(i for i, v in enumerate(cells) if isinstance(v, str) and v.strip().startswith("অদ্যকার"))
            continue
        if first.startswith("যে সকল বাজার"):
            out["markets"] = clean(" ".join(str(v) for v in cells[1:] if v)).strip(" ।") if any(cells[1:]) else None
            break
        if col is None or not first:
            continue
        lo, hi, unit = cells[col], cells[col + 1], cells[1]
        if isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and isinstance(unit, str) and unit.strip():
            out["rows"].append((clean(first), clean(unit), float(lo), float(hi)))
    return out


class TcbRetailPrices(Connector):
    name = "tcb_retail_prices"
    version = "1"
    source_id = "tcb_prices"
    auto_accept = True
    creates_entities = False
    full_snapshot = False   # one sheet a day

    def fetch(self, ctx: Context):
        if ctx.params.get("sheets") is not None:   # saved sheets: [[url, path]]
            files = [(url, open(path, "rb").read()) for url, path in ctx.params["sheets"]]
        else:
            days = int(ctx.params.get("days", 1))
            with http.client(timeout=120) as c:
                page = http.get(c, TCB_LIST).text
                urls = list(dict.fromkeys(_XLSX_LINK.findall(page)))[:days]   # listed newest first
                files = [(u, http.get(c, u).content) for u in urls]
        self.sheets = []
        for url, content in files:
            art = ctx.store_artifact(uri=url, content=content, content_type=XLSX, filename_hint="tcb-daily-retail.xlsx")
            self.sheets.append((url, art, read_tcb_sheet(content)))
        return [a for _, a, _ in self.sheets]

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for url, art, sheet in self.sheets:
            if sheet["date"] is None or not sheet["rows"]:
                ctx.error("parse", "no date or no price rows in the sheet", None, url=url)
                continue
            for item, unit, lo, hi in sheet["rows"]:
                yield {"id": f"{sheet['date']}:{item}|{unit}", "item": item, "unit": unit, "lo": lo, "hi": hi,
                       "date": sheet["date"].isoformat(), "memo": sheet["memo"], "markets": sheet["markets"],
                       "url": url, "artifact_id": str(art.id)}

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="price_row", source_record_id=raw["id"], fields={}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        dhaka = s.scalar(select(AdminUnit).where(AdminUnit.slug == "bd-district-dhaka"))
        for rec in records:
            r = rec.raw
            key, day = f"{r['item']}|{r['unit']}", date.fromisoformat(r["date"])
            if any(w in r["item"] for w in NON_FOOD):
                ctx.count("non_food_skipped")
                continue
            if r["lo"] == 0 and r["hi"] == 0:
                ctx.count("not_in_market")           # e.g. hilsa out of season
                continue
            if s.scalar(select(PriceObservation.id).where(PriceObservation.source_id == self.source_id,
                                                          PriceObservation.item_key == key, PriceObservation.observed_on == day)):
                ctx.count("already_recorded")
                continue
            s.add(PriceObservation(
                price_kind="market_retail", item_key=key, item_label=r["item"], unit=r["unit"], amount_min=r["lo"],
                amount_max=r["hi"], currency="BDT", district_id=dhaka.id if dhaka else None,
                area_label=f"ঢাকা মহানগর: {r['markets']}" if r["markets"] else "ঢাকা মহানগর", observed_on=day,
                source_id=self.source_id, artifact_id=uuid.UUID(r["artifact_id"]), source_url=r["url"],
                last_checked_at=ctx.now, verification_method="parsed_official_spreadsheet", status="published",
                notes=f"TCB memo {r['memo']}" if r["memo"] else None, job_id=ctx.job.id))
            ctx.count("prices_written")
        s.flush()


# --- Hotel websites ------------------------------------------------------------------------------

# Not the hotel's own site: platforms, social pages, chains' booking engines
NOT_OWN_SITE = ("facebook.", "fb.com", "fb.me", "instagram.", "booking.com", "agoda.", "tripadvisor", "google.", "goo.gl",
                "wa.me", "whatsapp", "youtube", "linktr", "bio.link", "expedia", "trip.com", "hotels.com", "airbnb",
                "business.site", "ihg.com", "marriott.com", "hilton.com", "accor", "radissonhotels", "wyndhamhotels",
                "bestwestern.com", "sharetrip", "gozayaan", "obokash")
MAX_SUBPAGES = 4
_RATE_LINK = re.compile(r"room|tariff|rate|price|accommodation|suite|cottage|ভাড়া|রুম", re.I)
_BDT = r"BDT|Tk\.?|TK\.?|Taka|৳|টাকা"
_AMOUNT = r"[0-9০-৯]{1,3}(?:,[0-9০-৯]{3})+|[0-9০-৯]{3,6}"
PRICE = re.compile(rf"(?<![A-Za-z0-9])(?:(?P<pre>US\$|USD|\$|{_BDT})\s?(?P<a1>{_AMOUNT})(?:\.\d\d)?(?:\s?/-)?"
                   rf"|(?P<a2>{_AMOUNT})(?:\.\d\d)?\s?(?P<post>/-|{_BDT}|USD)(?![A-Za-z]))", re.I)
ROOM = re.compile(r"(?i)\b(super\s+deluxe|deluxe|premium|executive|superior|standard|economy|junior\s+suite|suite|twin|double|"
                  r"single|couple|family|queen|king|triple|cottage|villa|bungalow|dormitory|room)\b|ডিলাক্স|স্যুট|কাপল|ফ্যামিলি|টুইন|"
                  r"সিঙ্গেল|ডাবল|কটেজ|রুম|কক্ষ")
NOT_A_ROOM = re.compile(r"(?i)extra\s*(bed|person|adult)|child|kid|breakfast|lunch|dinner|buffet|meal|food|per\s*(person|head|pax)|"
                        r"\bpp\b|transfer|pick\s*-?\s*up|drop|airport|spa\b|massage|laundry|deposit|advance|save|\boff\b|"
                        r"discount|(?<!virtual )\btours?\b|boat|ticket|bbq|package|cancel|day\s*-?\s*long|night\s*stay|"
                        r"picnic|retreat|student|youth|corporate|event|conference|wedding|পরিবহন|খাবার|নাস্তা|অতিরিক্ত|শিশু|জন প্রতি|ছাড়")
PER_PERSON = re.compile(r"(?i)\s*(\+\+|/-)?\s*\(?\s*(all\s+inclusive\s+)?(/|per|a)\s*(person|head|pax|adult|child|kid|p\b)"
                        r"|\s*জন\s*প্রতি")
BDT_RANGE, USD_RANGE = (500, 150_000), (15, 2_000)
MAX_RATES_PER_SITE = 25    # more is a menu or a package list, not a tariff
PLACEHOLDER = re.compile(r"(?i)lorem\s+ipsum|consectetur\s+adipiscing")
OUTLIER_SHARE = 0.4       # a rate under 40 % of the hotel's middle rate is likely something else (an extra person …)


def page_text(body: str) -> str:
    return " ".join(html.unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", body, flags=re.S)).split())


_LABEL_NOISE = {"book", "now", "know", "more", "read", "view", "details", "gallery", "photo", "tours", "virtual", "tariff",
                "tariffs", "rate", "rates", "bdt", "usd", "tk", "tk.", "taka", "type", "night", "per", "service", "price", "from",
                "amenities", "facilities", "contact", "home", "menu", "rooms", "suites", "accommodation"}


def room_label(before: str, room: re.Match) -> str:
    """The room's name as printed: the room word and up to four words before it, stopping at a number,
    the end of a sentence or page furniture ("Book Now", "Photo Gallery")."""
    tokens = before[:room.end()].split()
    words: list[str] = []
    for i, tok in enumerate(reversed(tokens)):
        bare = tok.strip("()[]:|,").casefold()
        prose = bool(re.match(r"[a-z&]", tok))             # names are capitalised: "is defined as a room" stops at "a"
        if i and (re.search(r"[0-9০-৯$৳]", tok) or bare in _LABEL_NOISE or prose or tok.endswith((".", ":", "|", "-->"))
                  or len(words) >= 5):
            break
        if not words or tok.casefold() != words[0].casefold():   # "Deluxe Room Room"
            words.insert(0, tok)
    label = " ".join(words).strip(" :|,-")
    if label.count("(") > label.count(")"):
        label += ")"
    return label or room.group(0)


def extract_rates(text: str) -> list[dict[str, Any]]:
    """Room-rate candidates on one page: {amount, currency, label, context, room_rate}."""
    out = []
    for m in PRICE.finditer(text):
        marker = (m.group("pre") or m.group("post") or "").upper()
        amount = float((m.group("a1") or m.group("a2")).translate(_BN_DIGITS).replace(",", ""))
        currency = "USD" if marker in ("US$", "USD", "$") else "BDT"
        lo, hi = USD_RANGE if currency == "USD" else BDT_RANGE
        if not lo <= amount <= hi:
            continue
        before, after = text[max(0, m.start() - 120): m.start()], text[m.end(): m.end() + 40]
        rooms = list(ROOM.finditer(before))
        label = room_label(before, rooms[-1]) if rooms else None
        # What a price is for is said before it; after it, only "per person" (the next item starts there)
        not_room = NOT_A_ROOM.search(text[max(0, m.start() - 45): m.start()]) or PER_PERSON.match(after)
        out.append({"amount": amount, "currency": currency, "label": (label or "")[:120] or None,
                    "context": clean(before[-100:] + " ⟨" + m.group(0) + "⟩ " + after)[:300],
                    "room_rate": bool(rooms) and not not_room})
    seen, unique = set(), []
    for c in out:
        k = (c["label"], c["amount"], c["currency"])
        if k not in seen:
            seen.add(k)
            unique.append(c)
    return unique


def own_site(url: str | None) -> str | None:
    if not url or any(k in url.lower() for k in NOT_OWN_SITE):
        return None
    return url if url.startswith("http") else "http://" + url


def crawl(url: str) -> dict[str, Any]:
    """The homepage and its rooms / tariff pages: {pages: [(url, html)], blocked, error}."""
    with http.client(timeout=20) as c:
        try:
            if not http.robots_allows(c, url):
                return {"pages": [], "blocked": True}
            r = http.get(c, url)
            if r.status_code != 200 or "html" not in r.headers.get("content-type", "text/html"):
                return {"pages": [], "error": f"HTTP {r.status_code}"}
            home = str(r.url)
            pages, links = [(home, r.text)], []
            for m in re.finditer(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', r.text, re.S | re.I):
                if _RATE_LINK.search(m.group(1) + " " + re.sub(r"<[^>]+>", " ", m.group(2))):
                    u = urljoin(home, m.group(1))
                    if urlsplit(u).netloc == urlsplit(home).netloc and u != home and u not in links:
                        links.append(u)
            for u in links[:MAX_SUBPAGES]:
                try:
                    if http.robots_allows(c, u):
                        rr = http.get(c, u)
                        if rr.status_code == 200 and "html" in rr.headers.get("content-type", "text/html"):
                            pages.append((str(rr.url), rr.text))
                except httpx.HTTPError:
                    pass
            return {"pages": pages}
        except (httpx.HTTPError, ValueError) as e:
            return {"pages": [], "error": type(e).__name__}


class HotelWebsiteRates(Connector):
    name = "hotel_website_rates"
    version = "1"
    source_id = "hotel_websites"
    auto_accept = True
    creates_entities = False
    full_snapshot = False   # a crawl reaches some sites, not all, each run

    def fetch(self, ctx: Context):
        s = ctx.session
        q = select(ServicePlace).where(ServicePlace.kind == "accommodation", ServicePlace.status.in_(("published", "needs_review")),
                                       ServicePlace.website.is_not(None))
        if ctx.params.get("districts"):
            ids = s.scalars(select(AdminUnit.id).where(AdminUnit.slug.in_(ctx.params["districts"]))).all()
            q = q.where(ServicePlace.district_id.in_(ids))
        places = [(p.id, own_site(p.website)) for p in s.scalars(q.order_by(ServicePlace.slug))]
        places = [(pid, u) for pid, u in places if u][: int(ctx.params.get("limit", 100_000))]
        ctx.count("sites", len(places))
        if ctx.params.get("pages") is not None:     # tests: {url: html}
            results = {u: {"pages": [(u, ctx.params["pages"][u])]} if u in ctx.params["pages"] else {"pages": [], "error": "x"}
                       for _, u in places}
        else:
            with ThreadPoolExecutor(max_workers=int(ctx.params.get("workers", 12))) as pool:
                results = dict(zip([u for _, u in places], pool.map(crawl, [u for _, u in places])))
        self.sites = []
        for pid, u in places:
            res = results[u]
            if res.get("blocked"):
                ctx.count("sites_blocked_by_robots")
            elif res.get("error"):
                ctx.count("sites_unreachable")
            found, by_price = [], {}
            for page_url, body in res["pages"]:
                rates_page = bool(_RATE_LINK.search(urlsplit(page_url).path))
                # An unfinished template's prices may be the template's: a person looks first
                placeholder = bool(PLACEHOLDER.search(body))
                for c in extract_rates(page_text(body)):
                    if placeholder:
                        c = {**c, "room_rate": False, "placeholder": True}
                    # A price with nothing to say it's a room is kept for review only from a rooms / tariff page
                    if not c["room_rate"] and c["label"] is None and not rates_page:
                        continue
                    # The same price on two pages: keep the reading that says most
                    best = by_price.get((c["currency"], c["amount"]))
                    if best is not None and (best["room_rate"], best["label"] is not None) >= (c["room_rate"], c["label"] is not None):
                        continue
                    if best is not None:
                        found.remove(best)
                    entry = {**c, "page": page_url, "body": body}
                    by_price[(c["currency"], c["amount"])] = entry
                    found.append(entry)
            if found:
                # The pages a rate was read from are kept, as for any source
                arts = {}
                for f in found:
                    if f["page"] not in arts:
                        arts[f["page"]] = ctx.store_artifact(uri=f["page"], content=f["body"].encode("utf-8", "replace"),
                                                             content_type="text/html", filename_hint="rates.html").id
                    f["artifact_id"] = str(arts[f["page"]])
                    del f["body"]
            self.sites.append((pid, u, found))
        return []

    def parse(self, ctx: Context, arts) -> Iterable[dict[str, Any]]:
        for pid, site, found in self.sites:
            if found:
                yield {"id": f"{site}|{pid}", "place_id": str(pid), "rates": found}   # listings can share a site

    def normalize(self, ctx: Context, raw: dict[str, Any]) -> Record:
        return Record(entity_type="price_row", source_record_id=raw["id"], fields={}, raw=raw)

    def after(self, ctx: Context, records: list[Record]) -> None:
        s = ctx.session
        today = ctx.now.date()
        for rec in records:
            pid = uuid.UUID(rec.raw["place_id"])
            rates = rec.raw["rates"]
            noisy = sum(r["room_rate"] for r in rates) > MAX_RATES_PER_SITE
            room_bdt = sorted(r["amount"] for r in rates if r["room_rate"] and r["currency"] == "BDT")
            floor = room_bdt[len(room_bdt) // 2] * OUTLIER_SHARE if len(room_bdt) >= 3 else 0
            # This run's reading replaces the last one (kept as superseded)
            for old in s.scalars(select(PriceObservation).where(PriceObservation.service_place_id == pid,
                                                                PriceObservation.source_id == self.source_id,
                                                                PriceObservation.status.in_(("published", "needs_review")))):
                old.status = "superseded"
            place_ok = 0
            for r in rates:
                outlier = r["currency"] == "BDT" and r["amount"] < floor
                published = r["room_rate"] and not noisy and not outlier
                s.add(PriceObservation(
                    price_kind="rack_rate", service_place_id=pid, item_key=f"room|{(r['label'] or '').casefold()}",
                    item_label=r["label"] or "room (type not stated)", unit="per night", amount_min=r["amount"],
                    currency=r["currency"], observed_on=today, source_id=self.source_id,
                    artifact_id=uuid.UUID(r["artifact_id"]), source_url=r["page"], context=r["context"],
                    last_checked_at=ctx.now, verification_method="parsed_hotel_website",
                    status="published" if published else "needs_review", job_id=ctx.job.id,
                    notes="as the hotel publishes it; may be out of date, confirm when booking"
                          + ("; far below this hotel's other rates" if outlier else "")
                          + ("; the page still has template placeholder text" if r.get("placeholder") else "")))
                ctx.count("rates_published" if published else "rates_for_review")
                place_ok += published
            ctx.count("hotels_with_published_rate" if place_ok else "hotels_with_rates_for_review")
        s.flush()
