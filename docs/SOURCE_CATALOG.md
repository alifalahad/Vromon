# Source Catalog (Phase 0)

**Probed:** 2026-11-04 with `python -m vromon_data probe` (evidence: `data-platform/source-registry/probe-results.json`).
**Registry:** `data-platform/source-registry/sources.yaml` (30 sources).

A source is listed as **available** only when the probe reached it or official documentation was read. "Reachable" means the page answered; it does not mean the data was parsed yet.

**Access rules.**
- Web pages obey robots.txt.
- Documented APIs and bulk downloads (`fetch_policy: usage_policy`) follow the provider's published usage policy instead, and the policy link is recorded.
- Every request identifies the pipeline: `VromonDataBot/0.1 (…; <contact>)`. The contact comes from the git-ignored `data-platform/.env`, as Wikimedia's User-Agent policy requires.
- TLS is always verified. `.gov.bd` sites with incomplete certificate chains are verified through the operating system's certificate store (`truststore`).

## 1. Bangladesh

| Source | What the probe found | Licence / terms | Use |
|---|---|---|---|
| **HDX COD-AB `cod-ab-bgd`** (OCHA / BBS) | Package metadata: dataset date 2023-05-21 → 2025-06-01, last modified 2026-01-26. Files: GDB, SHP, GeoJSON (zip), **XLSX code table** | CC BY-IGO | **Production**: admin units, pcodes |
| **geoBoundaries BGD** | ADM1 8 units (CC0, 2015), ADM2 64 (CC BY 3.0 IGO, BBS/OCHA, 2020), ADM3 **544** (CC BY 3.0 IGO). Build 2023-12-12 | As stated | Cross-check; ADM3 count differs from the ~495 official upazilas (includes city thanas) |
| **District portals** `/pages/tourist-spot` | Gaibandha 9 entries, Bandarban 17, Cox's Bazar 15. Same table layout on every portal. Footer "সর্বস্বত্ব সংরক্ষিত" | **All rights reserved** | **Discovery and fact checks only** until a2i / Cabinet Division permits reuse |
| Bangladesh Tourism Board | Home page reachable | Unknown | Manual review |
| Bangladesh Parjatan Corporation | Home page reachable | Unknown | Manual review |
| Department of Archaeology; Forest Department | Home pages reachable | Unknown | Find protected-site lists (Phase 2) |
| DPDT (GI register) | Home page reachable | Unknown | Find GI list (Phase 8) |
| **Bangladesh Railway** railway.gov.bd | Timetable pages: **"টাইম টেবিল নং ৫৪, কার্যকরের তারিখ ১০.০৩.২০২৫"** (Eastern and Western zones), each with a PDF. Fare chart pages (Eastern, Western), each with several PDFs | No terms page; disclaimer only | **Production** (Phase 5) |
| eticket.railway.gov.bd | robots.txt disallows all | — | Link out only |
| data.gov.bd train PDF | Modified 2017-01-18, licence not specified | — | **Do not use** (stale) |
| **BRTA** fare page "আন্তঃজেলা ও দূরপাল্লার রুটের বাস ভাড়ার তালিকা" | 4 PDFs uploaded 2026-08 | Government publication | **Production** regulated fares (Phase 6). News reports a gazette effective 2026-09-22 (Tk 2.40/km), so check each PDF's effective date |
| RHD Distance Matrix Tool | Interactive route tool; no download, API, version or terms | Unknown | Reference only; ask RHD for data |
| **BIWTA** | Home page with notice PDFs (2024-12) and a route permit fee page | Unknown | Phase 6: find launch routes and fare notices |
| BIWTC | Home page reachable | Unknown | Phase 6 |
| CAAB | Home page reachable | Unknown | Airport list check |
| US-Bangla schedule page | Reachable | Airline terms | Schedules with checked date (Phase 6) |
| Novoair schedule page | Reachable; domestic: Dhaka, Chattogram, Cox's Bazar, Sylhet, Jashore, Rajshahi, Barishal, Saidpur | Airline terms | Schedules with checked date |
| Biman | **HTTP 403** to automated access | — | Manual check |

## 2. Open and global

| Source | Probe | Licence | Use |
|---|---|---|---|
| Wikidata SPARQL | OK (with contact User-Agent) | CC0 | **Production** for attraction identity, names, coordinates (plan decision: OSM is not published) |
| Wikivoyage API | OK | CC BY-SA 4.0 | Enrichment (text stays attributed) |
| Wikimedia Commons API | OK | Per file | Images, per-file licence |
| OpenStreetMap, Geofabrik BD extract | OK | ODbL | **Matching, hubs, routing and map layers only** (decision 2026-11-04) |
| Overpass API | Timed out once (public instance busy) | ODbL | Small queries; retry with backoff |
| Overture Places | Docs reachable | CDLA-Permissive-2.0 / Apache-2.0 | Enrichment |
| GeoNames | OK | CC BY 4.0 | Already used |
| OurAirports | OK (CSV) | Public domain | **Production** airports |
| Copernicus DEM GLO-30 | OK (AWS readme) | Free with attribution | **Production** terrain |
| Mobility Database | OK (GitHub catalog) | Per feed | World phase |
| UNESCO WHC | **HTTP 403** to automated access | Check terms | Manual |

## 3. Reference products (not sources)

unseenbd.com and unseenbangladesh.com were reviewed for which fields to model (plan §2a). Nothing is copied from them.

## 4. Follow-up checks (2026-11-05)

| Source | What was checked | Finding | Next step |
|---|---|---|---|
| **BIWTA** (biwta.gov.bd) | All notice, circular, press-release and route-permit pages; 23 documents whose titles mention fares, launches, routes or schedules | No launch timetable or per-route fare chart is published. The relevant documents are the **"নৌরুট পারমিট, সময়সূচী ও ভাড়া নির্ধারণ বিধিমালা ২০১৯"** (the rules for how routes, schedules and fares are set) and 2019 meeting notices about them; also a 2018 cyclone suspension notice. | Ask BIWTA for the current route-wise fare chart and schedules; import with `transcribed_fares` |
| **RHD Distance Matrix Tool** | The page's own HTML | It calculates routes on **RHD's own road network** (an ArcGIS Network Analyst route service on gis.rhd.gov.bd), not OpenStreetMap. That makes its distances worth having, but the service is the tool's back end, not a published dataset. Bulk use without permission isn't done (guideline §2.3), and an automated check of the service was refused by this environment's safety controls. | Ask RHD for the district distance table, or written permission to query the route service at a low rate |
| **District portals, tourist spots** | All 64 districts, all pages (`bd_portal_tourist_spots`) | Facts only (that a named place is on the district's official list) are used to confirm or propose attractions. Descriptions, directions and photos are not copied. | Letter to a2i only if their text and photos are wanted |

## 5. Hotels and restaurants (2026-11-05)

| Source | What it gives | Licence | Use |
|---|---|---|---|
| **Overture Maps Places**, release 2026-10-21.0 (S3, queried with DuckDB for the Bangladesh box) | 10,916 lodging and 31,525 food listings, with location, category, website, phone, address and Overture's confidence score. Sources: Meta (most), Microsoft, AllThePlaces, PinMeTo, Foursquare. | CDLA-Permissive-2.0; Foursquare rows Apache-2.0 (keep the NOTICE); AllThePlaces CC0 | **Production**, labelled "business listing, not checked". Confidence ≥ 0.8 published, 0.7–0.8 review, < 0.7 skipped. |
| **Ministry of Civil Aviation and Tourism**, Hotel & Restaurant Cell: five-, four- and three-star hotel lists (mocat.gov.bd) | Official star class, name and address | Government publication (facts) | **Production**: official star rating on the matched listing |
| hotels.gov.bd (Parjatan reservations) | Parjatan's own hotels and motels | — | Timed out (522) on 2026-11-05; check again |
| District portals, lodging pages ("রাত্রীযাপনের জন্য সরকারি ও বেসরকারি প্রতিষ্ঠান") | Government and private lodging per district | All rights reserved | Facts only (as with tourist spots); next step |
| Booking.com, Google Maps, TripAdvisor | Prices, reviews | Terms forbid reuse | **Not used** |

**Result of the 2026-11-05 import**

- Overture, release 2026-10-21.0: 43,593 rows in the box. 23,713 were skipped as low confidence and 10,328 as outside Bangladesh. That left **9,519 listings**:
  - places to stay: 1,564 published, 984 in review
  - places to eat: 3,936 published, 3,035 in review
  - published hotels in 60 of 64 districts; restaurants in all 64
- 133 listings whose name is an address ("তালতলী মুরগিবাজার, শ্রীপুর, গাজীপুর") are in review. 44 pairs that may be one business are `duplicate` review tasks; none was merged.
- Ministry star lists: all **53** entries recorded (20 five-star, 8 four-star, 25 three-star).
  - 16 matched a listing. Each match was checked against the official address, and all 16 are right.
  - The other 37 have their district but no location, and wait in review with the closest listing named. Some are only company names (e.g. "কারিশমা সার্ভিসেস লিমিটেড"); others are spelt differently in the listings (FARS, Tower Inn, City Inn).
  - Matching rules: whole names only, so "Long Beach" is not "Inani Long Bay"; names under 8 letters must match at 95 or more, so "Sea Crown" is not "Sea Queen"; a listing that two entries point to gets neither.
- Prices, room rates, ratings and opening hours: in neither source, so the API returns them as unknown.
