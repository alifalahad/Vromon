# Data Gap Analysis (Phase 0)

**Date:** 2026-11-04. For each domain: what the product needs, what exists, what is genuinely obtainable, and the gap that remains even after the pipeline is built.

| Domain | Needed | Exists today | Obtainable (evidence: `SOURCE_CATALOG.md`) | Remaining gap |
|---|---|---|---|---|
| Admin geography | Division → union, BN/EN names, codes, boundaries | 8 divisions (DB), 64 districts (mobile GeoJSON only) | HDX COD-AB (CC BY-IGO) + geoBoundaries | Union level depends on the HDX release; city thanas vs upazilas need reconciliation |
| Attractions | Names BN/EN, category, district/upazila, coordinates, description, hours, fees, best months | 188 Wikivoyage/Wikidata places in 10 towns (unverified); 25 demo places | Wikidata (CC0) for identity and coordinates; district portals for official lists (**permission needed**); OSM for checks only | Hours and fees are rarely in open sources: mostly **unknown** until human checks. Bangla names often missing in Wikidata. |
| Images | Licensed photo per attraction | One shared drawing | Wikimedia Commons (per-file licence) | Many small attractions have no free photo |
| Transport hubs | Stations, terminals, airports, ghats | None | OSM (checks), OurAirports, Railway station list (in timetables) | Bus terminal names and boarding points are not in any open official list |
| Trains | Services by direction, stops, times, off days, fares | None | **Railway timetable no. 54 PDFs + fare chart PDFs** | PDF parsing needs human review; fares by segment depend on PDF layout |
| Bus | Routes, operators, fares by class | Local estimates only | **BRTA regulated non-AC fare chart PDFs** | AC and operator fares, schedules, boarding points: **no open source** (partnership with Shohoz/BDTickets or manual capture) |
| Road distances | Official and calculated | ORS cache | BRTA chart km (official); OSRM on OSM (calculated) | RHD official table not downloadable (ask RHD) |
| Launch / ferry | Routes, schedules, cabin fares | None | BIWTA notices (to locate) | Schedules and cabin fares mostly from operators; seasonal suspensions need notices |
| Air | Routes, schedules | None | Airline schedule pages (US-Bangla, Novoair; Biman blocked) | Fares are date-specific: link out only |
| Food | District specialties with evidence | None | DPDT GI register (to locate); district heritage pages (permission) | Few dishes are GI-registered; others need a citable source |
| Accommodation / restaurants | Lawful listings | 21 + 27 Wikivoyage, demo for Cox's Bazar | Wikivoyage, OSM (checks), district lodging pages (permission) | Prices and availability are not in open sources |
| Facilities | Hospitals, police, ATMs | None | OSM (checks), DGHS registry (to locate) | Phone numbers need verification dates |
| Maps | 64 districts × 2 languages | Division and district outlines, hillshade tiles | geoBoundaries / HDX, Copernicus DEM, OSM rivers | Rivers' Bangla names; label review per district |
| RAG | Source-backed documents | Untyped documents | Wikivoyage text, official notices | Licence metadata missing on existing documents |
| World | Same domains for every country | Countries, regions, cities | Wikidata, Overture, OurAirports, Mobility Database | Flight schedules and fares are paid data |

## Priorities (by real availability and value)

1. **Admin geography** (open, official, complete): foundation for everything.
2. **Attractions from Wikidata** for the 4 pilot districts, checked against the district portals by a person.
3. **Trains** from the official timetable no. 54: the most complete official transport source.
4. **BRTA regulated bus fares** and official chart distances.
5. **Airports and domestic air schedules.**
6. Launch/ferry, food, facilities: after locating the official notices and lists.

## Requests to send (owner's action)

- a2i / Cabinet Division: permission to reuse district and upazila portal tourist-spot, lodging and heritage data.
- Roads and Highways Department: the district distance table or road network behind the Distance Matrix Tool.
- Bangladesh Railway, BRTA, BIWTA: confirmation that published timetables and fare charts may be republished with attribution.
- Shohoz / BDTickets: partnership for operator fares and schedules.
