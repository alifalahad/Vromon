# Vromon Bangladesh Travel Data & 3D Mapping Pipeline

## Implementation Guideline for Codex / Autonomous AI Engineering Agents

**Document type:** Project implementation specification\
**Project:** Vromon\
**Initial geographic scope:** Bangladesh only\
**Primary objective:** Build a reliable, auditable, continuously
maintainable Bangladesh travel knowledge database and a reproducible GIS
pipeline for attractive 3D district maps.\
**Important rule:** Real data only. Never invent destinations,
coordinates, fares, schedules, operators, opening hours, or source
references. Missing information must remain explicitly missing.

------------------------------------------------------------------------

# 1. Mission and Expected Outcome

Build the data foundation for Vromon, a Bangladesh-focused travel
discovery and journey-planning platform.

Vromon should eventually help a user:

1.  Discover tourist destinations throughout Bangladesh.
2.  Explore attractions by division, district, upazila, category, map,
    and search.
3.  View useful destination details in Bangla and English.
4.  Understand how to travel to a destination from another district or
    transport hub.
5.  Compare available travel modes: bus, train, airplane, launch, ferry,
    boat, and local transport where reliable information exists.
6.  See distances, estimated journey durations, departure/arrival times,
    operators, terminals, and fares, with clear source and verification
    information.
7.  Find nearby destinations, accommodation, restaurants, facilities,
    and useful services when reliable data is available.
8.  Use interactive Bangladesh maps and attractive district-specific 3D
    map illustrations.
9.  Ask questions through Vromon's search/RAG assistant using grounded,
    source-traceable information.

The first milestone is **a trustworthy Bangladesh data pipeline**, not a
huge number of records. It is better to have 500 verified destinations
than 10,000 fabricated or poorly sourced records.

## 1.1 Definition of done

The work is not complete merely because a map or page renders. A data
feature is complete only when:

-   The source is identified and its usage terms have been checked.
-   The record has a stable internal ID.
-   Required fields have validation rules.
-   The source and retrieval/verification dates are stored.
-   Unknown values are represented as unknown, not guessed.
-   Duplicates and conflicting records can be identified.
-   An ingestion process can be repeated safely.
-   The result can be inspected and corrected by a human.
-   The frontend clearly distinguishes official, operator-confirmed,
    calculated, community-sourced, and unverified information.

------------------------------------------------------------------------

# 2. Work Rules for the AI Agent

Codex or another coding agent must follow these rules throughout the
project.

## 2.1 Inspect before changing

1.  Inspect the existing repository, README, architecture, package
    files, database schema, migrations, environment configuration, API
    routes, frontend, tests, and current RAG implementation.
2.  Do not replace the current stack or restructure the whole project
    without a clear technical reason.
3.  Identify existing destination, route, transport, and map features.
    Reuse good implementations.
4.  Create a short implementation plan and report the current state
    before making large changes.
5.  Work in small phases. After each phase, run tests and report exactly
    what changed.

## 2.2 Never fabricate data

Forbidden examples:

-   Creating random tourist attractions to make district coverage look
    complete.
-   Inventing GPS coordinates.
-   Generating bus fares from distance and displaying them as actual
    fares.
-   Inventing train schedules, operators, terminals, or route
    availability.
-   Assuming a train stops at a station because the station is
    geographically nearby.
-   Claiming an attraction is open or accessible without evidence.
-   Presenting a route planner's estimated distance as an official
    distance.
-   Presenting AI-generated descriptions as verified historical facts.
-   Using placeholder values such as `৳500` in production records.

For unavailable information:

-   Store `null` where appropriate.
-   Set a clear data status such as `unknown`, `not_found`, or
    `needs_verification`.
-   Explain in the UI that information is currently unavailable.
-   Create a verification task if the field is important.

AI may help extract, normalize, translate, classify, or summarize source
material. AI must not create factual claims without source evidence.

## 2.3 Respect licensing and access restrictions

-   Check the terms of use, copyright, attribution requirements, and
    licenses before collecting data.
-   Follow robots.txt and website terms where applicable.
-   Do not bypass authentication, rate limits, CAPTCHAs, paywalls, or
    technical restrictions.
-   Do not copy another website's complete database or images without
    permission.
-   Prefer official open datasets, documented APIs, public downloads,
    and direct operator confirmation.
-   Store license and attribution metadata for every imported dataset
    and image.
-   If terms are unclear, mark the source as requiring legal/owner
    review and do not bulk-copy it.

## 2.4 Make the pipeline reproducible

Every ingestion job should be:

-   Repeatable without creating duplicate records.
-   Logged with start/end time, source, input files, counts, errors, and
    version.
-   Able to run in dry-run mode.
-   Able to resume or retry safely.
-   Able to detect changed source records.
-   Able to preserve raw source files and normalized output separately.
-   Able to roll back or deactivate a bad import.

------------------------------------------------------------------------

# 3. Scope and Data Domains

Build these connected data domains. Do not put all information into one
giant `places` table.

## 3.1 Administrative geography

Bangladesh administrative hierarchy:

-   Country
-   Division
-   District
-   Upazila
-   Union / municipality / city corporation / ward where suitable source
    data exists
-   Village or locality only if there is a reliable source and a clear
    use case

Store stable source identifiers where available, but maintain Vromon's
own internal IDs.

Required attributes:

-   Internal ID
-   Official name in Bangla
-   Official or commonly used English name
-   Alternate spellings and aliases
-   Parent administrative unit
-   Official code, if available
-   Geometry or boundary reference
-   Centroid coordinates
-   Source
-   Source license
-   Last imported date
-   Validation status

Do not assume administrative codes are stable across all source
providers. Preserve the provider and provider-specific code.

## 3.2 Tourist destinations and points of interest

Include relevant types of places, not only famous attractions:

-   Natural attractions
-   Beaches and islands
-   Rivers, haors, wetlands, waterfalls
-   Hills, forests, parks, gardens
-   Archaeological sites
-   Historical buildings and monuments
-   Museums
-   Religious and cultural sites
-   Heritage locations
-   Viewpoints
-   Eco-tourism locations
-   Recreation and family attractions
-   Local-interest destinations when supported by evidence

Destination fields:

-   `id`
-   `canonical_name_en`
-   `canonical_name_bn`
-   `alternate_names`
-   `slug`
-   `description_en`
-   `description_bn`
-   `short_description_en`
-   `short_description_bn`
-   `category_id`
-   `subcategory_id`
-   `division_id`
-   `district_id`
-   `upazila_id`
-   `locality`
-   `latitude`
-   `longitude`
-   `location_geometry`
-   `location_precision`
-   `entry_fee_amount`
-   `entry_fee_currency`
-   `entry_fee_description`
-   `opening_hours`
-   `best_visit_months`
-   `recommended_visit_duration`
-   `accessibility_notes`
-   `visitor_rules`
-   `safety_notes`
-   `contact_information`
-   `official_website`
-   `status`
-   `created_at`
-   `updated_at`

Keep optional fields nullable. A place may not have an entry fee or
official opening hours.

Create separate related tables for:

-   Destination categories and translations
-   Destination images and media
-   Destination source claims
-   Destination amenities
-   Destination facilities
-   Destination seasonal information
-   Destination access restrictions
-   Destination related places
-   Destination historical aliases
-   Destination verification events

### Destination identity and duplicate handling

The same attraction may appear with Bangla spelling variations, English
transliterations, old names, or slightly different coordinates.

Use a duplicate review workflow based on:

-   Normalized names
-   Administrative area
-   Geographic distance
-   Alternate names
-   Source IDs
-   Human review for uncertain matches

Never automatically merge two records only because their names are
similar.

## 3.3 Transport network

Represent transport as a network of hubs, routes, services, and journey
segments.

### Transport hubs

Support:

-   Bus terminals and stops
-   Railway stations
-   Airports
-   Launch terminals and river ports
-   Ferry ghats
-   Boat landing points
-   Local transport stands where data is reliable

Fields:

-   ID
-   Name in Bangla and English
-   Hub type
-   Coordinates
-   District/upazila
-   Operator or managing authority
-   Contact/website
-   Accessibility notes
-   Source and verification status

### Transport operators

Examples of operator types:

-   Bus company
-   Railway service provider
-   Airline
-   Launch operator
-   Ferry operator
-   Local boat service
-   Local road transport provider

Store operator identity separately from individual services.

### Routes and services

A route is not the same thing as a scheduled service.

Suggested concepts:

-   `transport_route`: a path or corridor connecting hubs.
-   `transport_service`: a service operated on a route.
-   `service_stop`: ordered stops on a service.
-   `service_schedule`: time-specific schedule and effective period.
-   `fare_product`: fare for a particular service/class/seat/vehicle
    category.
-   `route_geometry`: mapped or calculated path, with method and source.

Support modes:

-   Bus
-   Train
-   Airplane
-   Launch
-   Ferry
-   Boat
-   CNG/auto-rickshaw
-   Local bus
-   Other documented modes

Do not assume every mode is available between every pair of districts.

## 3.4 Road and district-to-district journeys

Vromon should support questions such as:

-   Dhaka to Gaibandha
-   Khulna to Cox's Bazar
-   Sylhet to Bandarban
-   A tourist destination from the nearest railway station
-   A tourist destination from a bus terminal or launch ghat

Do not manually store all 64 × 63 district combinations as independent
facts.

Instead:

1.  Maintain district polygons and centroids.
2.  Maintain transport hubs.
3.  Maintain transport routes and services.
4.  Maintain a routable road network or use a properly licensed routing
    provider.
5.  Calculate possible journeys from network connections.
6.  Cache frequently requested journey results with calculation
    metadata.
7.  Recalculate when the underlying route network changes.

For each calculated journey store:

-   Origin and destination
-   Selected origin/destination hubs
-   Transport mode
-   Route geometry or route reference
-   Distance
-   Estimated duration, if available
-   Calculation engine/provider
-   Routing profile
-   Calculation timestamp
-   Source network version
-   Whether the route is direct or requires transfers

A calculated distance is not an official fare-chart distance. Keep those
separate.

## 3.5 Fare database

Fare information is highly dynamic. It must be modeled carefully.

A fare record should include:

-   Transport mode
-   Operator
-   Service or route
-   Origin hub
-   Destination hub
-   Vehicle/service type
-   Seat/class/category
-   Amount
-   Currency
-   One-way/return indicator
-   Fare type
-   Effective-from date
-   Effective-to date, if known
-   Source URL or source document
-   Source organization
-   Last checked date
-   Verification method
-   Confidence/status
-   Notes and conditions

Distinguish at least:

1.  Government-approved or regulated fare.
2.  Operator-published fare.
3.  Ticket-platform displayed fare.
4.  Human-confirmed fare.
5.  Historical fare.
6.  Estimated fare.

Never combine these into one unexplained number.

For bus services, preserve differences such as AC/non-AC, seat class,
vehicle type, route, boarding point, and operator.

For trains, preserve the official class/category and fare by
route/segment where the source provides it.

For flights, distinguish base fare, taxes, baggage rules, and
date-dependent displayed price. Do not treat a single flight search
price as a permanent fare.

For launches, fares may vary by cabin/class, deck, route, and operator.
Store the exact category and effective period.

If a fare is not available, show "Not verified" or "Check with
operator," not an invented estimate.

## 3.6 Train dataset

Train information should be represented in separate entities:

-   Train
-   Train service / direction
-   Station
-   Ordered station stop
-   Timetable version
-   Weekly operating days / off day
-   Fare by origin-destination segment and class
-   Schedule validity period
-   Source document

Train fields:

-   Train name in Bangla and English
-   Train number
-   Direction
-   Origin station
-   Destination station
-   Ordered stops
-   Arrival time at each stop
-   Departure time at each stop
-   Weekly off day
-   Effective-from date
-   Effective-to date
-   Service status
-   Fare classes
-   Fare by segment and class
-   Source and verification metadata

A train may have different times in each direction. Never assume the
reverse schedule by swapping origin and destination.

Store timetable versions rather than overwriting history without trace.

## 3.7 Accommodation, food, and facilities

Potential datasets:

-   Hotels
-   Resorts
-   Guest houses
-   Hostels
-   Restaurants
-   Local food specialties
-   Hospitals and clinics
-   Pharmacies
-   ATMs and banks
-   Police stations
-   Tourist police
-   Public toilets
-   Parking
-   Tourist information centers
-   Emergency contacts

Only include public business information that is lawfully sourced.
Business hours, phone numbers, and availability can change and should
have verification dates.

For famous district foods, create a separate local-food entity. A dish's
association with a district should have a source; do not infer it from
popularity or a single unverified blog.

## 3.8 Travel knowledge and RAG corpus

The RAG knowledge base should contain source-backed documents such as:

-   Official destination descriptions
-   Visitor rules
-   Local travel guides
-   Transport instructions
-   Government notices
-   Seasonal warnings
-   Ferry/launch notices
-   Park or protected-area restrictions
-   Heritage information
-   Emergency and safety guidance

Every chunk must retain document/source metadata. RAG answers must cite
or link the underlying sources in the product wherever possible.

Do not put transient fares and schedules only in vector embeddings.
Query structured tables for current facts; use RAG for explanatory and
contextual information.

------------------------------------------------------------------------

# 4. Source Discovery Strategy for Bangladesh

The agent must investigate each source, document what is available, and
record the access method. A source name alone does not prove that a
usable dataset exists.

## 4.1 Government and official sources to investigate

Start with these organizations and search for their official websites,
data portals, APIs, PDF publications, GIS downloads, and public notices:

### Tourism and attractions

-   Bangladesh Tourism Board
-   Bangladesh Parjatan Corporation
-   District administration websites
-   Upazila administration websites
-   Ministry of Civil Aviation and Tourism
-   Department of Archaeology
-   Forest Department
-   Bangladesh Forest Research Institute where relevant
-   Protected-area and park authorities
-   Local government and city corporation portals

### Road and bus transport

-   Bangladesh Road Transport Authority (BRTA)
-   Roads and Highways Department (RHD)
-   Bangladesh Road Transport Corporation (BRTC)
-   Bangladesh Road Transport Owners/Workers organizations where
    official information is published
-   Individual bus operators
-   Authorized ticketing platforms, subject to their terms

### Railway

-   Bangladesh Railway
-   Official railway timetable and fare publications
-   Railway station and service notices
-   Official ticketing service, subject to its terms and technical
    access rules

### Water transport

-   Bangladesh Inland Water Transport Authority (BIWTA)
-   Bangladesh Inland Water Transport Corporation (BIWTC)
-   Bangladesh Water Development Board (BWDB)
-   Individual launch operators
-   Ferry service authorities and official notices

### Air transport

-   Civil Aviation Authority of Bangladesh (CAAB)
-   Biman Bangladesh Airlines
-   Other licensed domestic airlines
-   Official airline schedules and booking information, subject to terms

### Geography and statistics

-   Bangladesh Bureau of Statistics (BBS)
-   Survey of Bangladesh
-   Local Government Engineering Department (LGED)
-   Bangladesh Water Development Board
-   Bangladesh Meteorological Department
-   Department of Disaster Management
-   Official national GIS and open-data portals

## 4.2 Open geospatial sources to investigate

### OpenStreetMap (OSM)

Potential uses:

-   Roads and paths
-   Railway lines and stations
-   Airports
-   Bus stations
-   Ferry terminals
-   Rivers and waterways where mapped
-   Tourism-related points of interest
-   Amenities and public facilities
-   Administrative boundaries, subject to data quality

Use Overpass API or suitable regional extracts only within usage limits
and the applicable OSM/ODbL attribution requirements. Do not make the
public Overpass service the only production data source for high-volume
workloads. Consider a hosted provider or self-hosted extract when
appropriate.

OSM is community-sourced, not an official guarantee. Preserve OSM object
IDs, timestamps, tags, attribution, and import date.

### Wikidata

Potential uses:

-   Structured landmark facts
-   Alternate names
-   Coordinates
-   Historical identifiers
-   Links to official websites and Wikipedia articles

Use it as a discovery/enrichment source, not as the sole authority for
operational travel information. Preserve item IDs and
licenses/attribution obligations.

### Elevation and terrain

Investigate:

-   NASA SRTM elevation data
-   Copernicus DEM
-   Other appropriately licensed DEM products
-   USGS EarthExplorer or relevant official portals

Check spatial resolution, vertical datum, coverage, license, and
suitability before use. Do not mix elevation datasets without recording
which source/version was used.

### Satellite and land-cover imagery

Use only sources whose license permits the intended display, processing,
and redistribution. Do not assume that imagery visible in a map website
can be downloaded or reused.

## 4.3 Third-party websites as research references

The following websites were provided as examples of desired presentation
and data coverage:

-   `https://unseenbd.com/en/explore?district=54`
-   `https://unseenbd.com/en/routes`
-   `https://unseenbd.com/en/trains`
-   `https://unseenbangladesh.com/bangladesh-maps`

Use them to understand:

-   District-based tourist discovery
-   Destination cards and categories
-   District-to-district routes
-   Bus fare breakdowns
-   Train listings and detail pages
-   District map presentation
-   Rivers, attractions, neighboring districts, and local foods on a map

Important:

-   These sites are reference products, not automatically authoritative
    sources.
-   Do not assume they provide a public API or bulk download.
-   Do not copy their complete database, text, or images without
    permission.
-   If an API or structured data endpoint is discovered, inspect its
    documentation and terms before use.
-   Independently verify important facts against original government or
    operator sources.
-   A displayed "last checked" date is useful metadata, but it does not
    by itself prove correctness.

## 4.4 Source registry

Create a `data_sources` table and a machine-readable source registry
file.

Suggested fields:

-   `source_id`
-   `source_name`
-   `organization`
-   `source_type`
-   `website_url`
-   `dataset_name`
-   `access_method` (API, CSV, JSON, PDF, manual, permitted scraping,
    GIS download)
-   `license_name`
-   `license_url`
-   `attribution_text`
-   `terms_review_status`
-   `coverage`
-   `update_frequency`
-   `reliability_class`
-   `last_successful_fetch`
-   `last_human_review`
-   `notes`

Create a source assessment report for every candidate source:

  -------------------------------------------------------------------------
  Question                            Required assessment
  ----------------------------------- -------------------------------------
  Does the source actually contain    Yes / No / Partial
  the desired field?                  

  Is there a downloadable dataset?    Format and link

  Is there a documented API?          Documentation link

  Is access permitted?                Terms/license evidence

  Geographic coverage                 Districts/areas covered

  Update frequency                    Known/unknown

  Authority                           Government/operator/community/third
                                      party

  Known limitations                   Missing fields, stale data,
                                      incomplete coverage

  Recommended use                     Production / enrichment / discovery
                                      only
  -------------------------------------------------------------------------

Do not claim a source is official or complete without evidence.

------------------------------------------------------------------------

# 5. Data Acquisition and ETL Pipeline

Build a modular pipeline with the following stages:

1.  Discover source.
2.  Review source terms and license.
3.  Fetch/download raw data.
4.  Store immutable raw snapshot.
5.  Parse source format.
6.  Normalize fields.
7.  Validate schema and values.
8.  Resolve administrative geography.
9.  Detect duplicates.
10. Match entities across sources.
11. Record source claims and provenance.
12. Run quality checks.
13. Send uncertain records to human review.
14. Publish approved records.
15. Index appropriate documents for search/RAG.
16. Monitor source freshness and changes.

## 5.1 Suggested folder layout

Adapt this to the existing repository rather than blindly replacing it.

``` text
vromon/
├── apps/
│   ├── web/
│   └── api/
├── data-platform/
│   ├── README.md
│   ├── source-registry/
│   │   ├── sources.yaml
│   │   └── source-assessments/
│   ├── schemas/
│   │   ├── destination.schema.json
│   │   ├── transport-service.schema.json
│   │   ├── fare.schema.json
│   │   └── map-layer.schema.json
│   ├── ingestion/
│   │   ├── common/
│   │   ├── tourism/
│   │   ├── geography/
│   │   ├── roads/
│   │   ├── railway/
│   │   ├── bus/
│   │   ├── water-transport/
│   │   └── aviation/
│   ├── normalization/
│   ├── deduplication/
│   ├── validation/
│   ├── enrichment/
│   ├── geospatial/
│   ├── map-generation/
│   ├── quality-reports/
│   ├── raw/
│   │   └── .gitkeep
│   ├── processed/
│   ├── exports/
│   └── tests/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── docs/
├── docs/
│   ├── DATA_DICTIONARY.md
│   ├── SOURCE_CATALOG.md
│   ├── DATA_QUALITY_POLICY.md
│   ├── MAP_PIPELINE.md
│   └── OPERATIONS_RUNBOOK.md
└── scripts/
```

Do not commit large raw datasets, credentials, or restricted material to
Git. Use configured object storage or an appropriate local data
directory. Add data manifests and checksums.

## 5.2 Raw, staging, and curated layers

Use three logical layers:

### Raw

-   Exact downloaded file or API response.
-   Original filename and URL.
-   Fetch timestamp.
-   Checksum.
-   License/source metadata.
-   Do not edit the raw copy.

### Staging

-   Parsed records.
-   Normalized field names.
-   Original source values retained.
-   Validation errors recorded.
-   Duplicates flagged.
-   Not automatically public.

### Curated

-   Approved, canonical Vromon records.
-   Stable internal IDs.
-   Linked source claims.
-   Verified geometry and translations.
-   Ready for API and frontend use.

Never overwrite raw data with normalized data.

## 5.3 Ingestion connector contract

Each connector should implement a consistent interface:

``` python
class SourceConnector:
    def discover(self):
        """Return source metadata and available resources."""

    def fetch(self, dry_run: bool = False):
        """Fetch permitted source data and save an immutable raw snapshot."""

    def parse(self, raw_artifact):
        """Convert raw input into source-native records."""

    def normalize(self, records):
        """Map source-native fields into staging schema."""

    def validate(self, records):
        """Return valid records and structured validation errors."""

    def report(self):
        """Return counts, errors, provenance, and source freshness."""
```

Use a connector per source or source family. Do not write one fragile
scraper for every website.

## 5.4 Change detection and incremental updates

-   Store source record identifiers where available.
-   Compare source checksums or updated timestamps.
-   Detect additions, modifications, and removals.
-   Do not delete a curated record simply because it disappears from one
    source.
-   Mark records for review when a source changes or disappears.
-   Keep version history for important data such as schedules and fares.
-   Use effective dates for time-dependent facts.

## 5.5 Human review queue

Build a review interface or admin workflow for:

-   Possible duplicate destinations
-   Conflicting coordinates
-   Conflicting place names
-   Missing district/upazila mapping
-   Fare conflicts
-   Train schedule changes
-   Unclear licensing
-   Low-confidence image matches
-   Unverified business details

Review actions should be auditable: reviewer, timestamp, previous value,
new value, source, and reason.

------------------------------------------------------------------------

# 6. Data Quality and Verification Policy

## 6.1 Status values

Use clear statuses such as:

-   `draft`
-   `imported`
-   `needs_review`
-   `verified`
-   `published`
-   `stale`
-   `disputed`
-   `rejected`
-   `inactive`

Do not use one generic `verified=true` flag for every field. A
destination's coordinates may be verified while its opening hours remain
unknown.

## 6.2 Field-level provenance

Important factual fields should have field-level or claim-level
provenance.

Example:

-   Destination name: source A, retrieved date, confidence.
-   Coordinates: source B, object ID, precision, validation date.
-   Entry fee: official notice, effective date.
-   Opening hours: operator page, checked date.
-   Description: source document and relevant excerpt/reference.

A generic source URL on the whole destination is not enough when
different fields come from different sources.

Suggested `source_claims` table:

-   `id`
-   `entity_type`
-   `entity_id`
-   `field_name`
-   `claimed_value`
-   `source_id`
-   `source_record_id`
-   `source_url`
-   `source_published_at`
-   `retrieved_at`
-   `verified_at`
-   `verification_method`
-   `confidence`
-   `status`
-   `review_notes`

## 6.3 Reliability classes

Use descriptive source classes, not fake numerical certainty:

-   Official government source
-   Official transport operator
-   Direct human confirmation
-   Licensed/contracted provider
-   Community geospatial source
-   Reputable secondary source
-   Unverified user contribution
-   AI-extracted, awaiting review

A source class does not automatically make a particular field correct.
Keep the actual source and verification date.

## 6.4 Validation rules

Examples:

-   Latitude must be between -90 and 90.
-   Longitude must be between -180 and 180.
-   Bangladesh destination coordinates should be checked against the
    Bangladesh geographic extent, with special review for
    offshore/island cases.
-   A destination's district should be spatially consistent with its
    point, unless a documented boundary/source issue exists.
-   A route distance must be positive.
-   A fare must be non-negative and have a currency.
-   A schedule must include a timezone assumption, normally Bangladesh
    Standard Time (`Asia/Dhaka`).
-   Arrival/departure sequences must be logically valid, allowing for
    overnight services.
-   Effective-to date must not precede effective-from date.
-   Train stop order must be unique within a service direction.
-   Image license and source must be recorded before public display.
-   Bangla and English text must be stored as Unicode.
-   Do not silently treat blank strings, zero, and null as equivalent.

## 6.5 Freshness policy

Set update targets by data type, then tune them according to actual
source behavior:

  -----------------------------------------------------------------------
  Data                                Suggested review policy
  ----------------------------------- -----------------------------------
  Administrative boundaries           On official revision; periodic
                                      check

  Destination coordinates             Verify on import; recheck on
                                      reported issue

  Destination descriptions            Annual or when source changes

  Entry fees                          Recheck before presenting as
                                      current

  Opening hours                       Recheck regularly and label checked
                                      date

  Train timetables                    Check official notices and
                                      timetable revisions

  Bus fares                           Recheck with operator/official fare
                                      source

  Flight schedules/fares              Date-specific; do not store as
                                      permanent

  Launch schedules/fares              Recheck with operator/authority

  Road network                        Refresh according to
                                      provider/update availability

  DEM/elevation                       Versioned dataset; update only when
                                      a better source is adopted
  -----------------------------------------------------------------------

Do not display a stale fare or timetable as current. Show the last
verified date and a warning or suppress it according to the product
policy.

------------------------------------------------------------------------

# 7. 3D Bangladesh District Map System

This is a major visual requirement.

Vromon should create a family of district maps inspired by the provided
Unseen Bangladesh map examples, but with original layouts, data, visual
identity, and properly licensed inputs.

## 7.1 Desired district map content

Each district map should ideally show:

1.  District outline.
2.  3D terrain/elevation effect where the geography supports it.
3.  Major rivers and waterways.
4.  Important tourist destinations.
5.  Nearby/neighboring districts.
6.  District name in Bangla and English.
7.  Selected major towns or administrative centers.
8.  Important roads and railways, if map scale permits.
9.  Famous local foods, with source-backed labels or a separate
    information panel.
10. Legend, scale, north indicator, data credits, and map version/date.

Do not force every layer into one crowded map. Provide a clear primary
map and optional thematic versions.

A flat or low-relief district may not visibly benefit from exaggerated
terrain. Do not invent hills or vertical relief to make every district
look dramatic. Use restrained extrusion or a clean 2.5D style where
appropriate.

## 7.2 Two separate products

Build both:

### A. Interactive map

For the Vromon website/app:

-   Pan and zoom
-   District selection
-   Destination markers
-   Category filters
-   Layer toggles
-   Clickable destination cards
-   Search
-   Nearby place exploration
-   Route overlays
-   Mobile-responsive behavior

### B. Static 3D district map images

For district pages, posters, share cards, and visual exploration:

-   One original map per district.
-   Bangla and English versions where translation is available.
-   Consistent layout and style.
-   Export at high resolution.
-   Include data source credits.
-   Generate from GIS data, not manually draw each district.

The target of 64 districts × 2 languages = 128 map variants is a
production target, not a reason to publish unverified labels.

## 7.3 Recommended GIS toolchain

Select tools based on the existing stack and team capability. A
practical open-source path is:

### Data preparation

-   Python
-   GeoPandas
-   Shapely
-   GDAL/OGR
-   Rasterio
-   PyProj
-   PostGIS
-   QGIS for visual inspection and cartographic styling

### Interactive web map

Choose one primary rendering approach after a small proof of concept:

-   MapLibre GL JS for vector/raster web maps and 3D terrain/extrusion
    capabilities where supported.
-   MapLibre-compatible terrain source and a licensed DEM.
-   Deck.gl where complex data overlays or large-scale geospatial
    visualization are needed.
-   CesiumJS only if globe-scale 3D terrain/building visualization is a
    genuine requirement.

Do not add multiple map libraries without a clear need. Verify current
versions, licensing, rendering support, and hosting requirements before
choosing.

### Static 3D map production

Possible approaches:

-   QGIS layouts with hillshade and carefully styled vector layers.
-   MapLibre/Three.js-based controlled rendering if custom 3D
    composition is required.
-   Blender only for advanced presentation work when it can be driven
    reproducibly from GIS exports.

Prefer automated templates over hand-editing 64 maps.

## 7.4 District map production workflow

1.  Obtain a legally usable district boundary dataset.
2.  Validate and repair polygon geometry.
3.  Reproject data into a suitable projected CRS for measurements and
    cartography.
4.  Obtain a suitable DEM covering Bangladesh.
5.  Clip DEM to the district plus a small surrounding buffer.
6.  Generate hillshade or terrain shading.
7.  Prepare rivers, roads, railways, and place layers.
8.  Spatially assign destinations to districts and verify boundary edge
    cases.
9.  Obtain neighboring district polygons.
10. Load district-specific verified food records.
11. Apply a consistent cartographic style.
12. Render Bangla and English labels using fonts with proper glyph
    support.
13. Add legend, scale, north arrow, source credits, and map date.
14. Export high-resolution PNG/JPG and optionally PDF/SVG if the
    toolchain supports it.
15. Run automated visual/data checks.
16. Review a sample manually before batch-generating all districts.
17. Store the exact dataset versions and rendering configuration used.

## 7.5 Map layer model

Use a versioned map-layer registry:

-   `layer_id`
-   `layer_name`
-   `layer_type`
-   `source_id`
-   `source_dataset_version`
-   `license`
-   `geometry_type`
-   `style_config`
-   `min_zoom`
-   `max_zoom`
-   `visibility_default`
-   `last_updated`
-   `attribution`

Potential layers:

-   District boundaries
-   Upazila boundaries
-   Rivers
-   Wetlands/haors
-   DEM/hillshade
-   Roads
-   Railways
-   Tourist destinations
-   Transport hubs
-   Accommodation
-   Food specialties
-   Protected areas

## 7.6 3D map accuracy rules

-   Terrain must derive from a real DEM.
-   Rivers must derive from a mapped/source dataset.
-   District borders must derive from an identified boundary source.
-   Destination markers must come from curated destination records.
-   Local foods must have a source-backed district association.
-   Neighboring districts should be calculated from polygon adjacency,
    then checked for islands, enclaves, and boundary topology.
-   Never use an AI image generator to create a map that looks
    geographically accurate. Image generation can be used for decorative
    illustrations, not as a substitute for GIS.
-   If a label is uncertain, omit it or mark it for review.

## 7.7 Image and map credits

Every exported map should have a credits file or metadata record
listing:

-   Boundary source and license
-   DEM source and license
-   River/road source and license
-   POI source and license
-   Food information sources
-   Map creation date
-   Data version
-   Attribution text

Do not assume that a source's map tiles or screenshots can be used in
generated map products. Obtain raw data under a compatible license.

------------------------------------------------------------------------

# 8. Images for Tourist Destinations

Images are important, but image rights and matching accuracy matter.

For each image store:

-   Image ID
-   Destination ID
-   Original image URL or asset reference
-   Photographer/creator
-   Source website
-   License
-   Attribution
-   Retrieval date
-   Resolution
-   Image checksum
-   Caption and language
-   Approval status
-   Whether the image is primary, secondary, or illustrative

Potential lawful sources to investigate:

-   Official tourism authority media
-   Government portals with explicit reuse permissions
-   Wikimedia Commons (check each file's individual license and
    attribution requirements)
-   Openverse discovery, followed by checking the original
    license/source
-   Direct agreements with photographers and local contributors
-   User-submitted images with explicit terms and moderation

Do not download arbitrary Google Images, Facebook, Instagram, or
travel-blog images and assume they are reusable.

AI-generated decorative artwork must never be presented as a real
photograph of a destination.

------------------------------------------------------------------------

# 9. Database Architecture

Use the existing database if it is sound. If the project has not yet
committed to a database, use PostgreSQL with PostGIS for the core
structured/geospatial database.

## 9.1 Suggested core tables

``` text
administrative_units
administrative_boundaries
destination_categories
destinations
destination_aliases
destination_media
destination_amenities
destination_facilities
destination_seasonality
transport_hubs
transport_operators
transport_routes
transport_route_stops
transport_services
transport_service_stops
transport_schedules
transport_fare_products
road_network_versions
journey_calculations
local_foods
food_place_associations
accommodation
restaurants
data_sources
source_artifacts
source_claims
ingestion_jobs
ingestion_job_errors
verification_events
map_layers
map_exports
rag_documents
rag_chunks
```

This is a proposed logical model. The agent must review existing schema
and design migrations that fit the repository.

## 9.2 Important relationships

-   One division has many districts.
-   One district has many upazilas.
-   One district has many destinations.
-   One destination can have multiple categories only if the category
    model explicitly supports it.
-   One destination can have multiple images and source claims.
-   One transport hub can connect to multiple routes/services.
-   One route has ordered stops.
-   One service runs on a route or route variant.
-   One service has schedules that are valid for a date range.
-   One service can have multiple fare classes/products.
-   A journey can combine multiple services and transfers.
-   Every important factual field or claim should link to its source
    evidence.
-   Map exports should record all input layer versions.

## 9.3 IDs and naming

-   Use UUIDs or another stable internal primary key.
-   Do not use district names as primary keys.
-   Preserve source-specific IDs in mapping tables.
-   Use Unicode for Bangla.
-   Keep canonical names separate from aliases and transliterations.
-   Slugs must be unique and stable; changing a display name should not
    silently break old URLs.

------------------------------------------------------------------------

# 10. API and Frontend Requirements

The data platform should expose clean APIs to Vromon's existing
frontend.

Potential API groups:

``` text
/api/v1/administrative-units
/api/v1/destinations
/api/v1/destinations/{id}
/api/v1/destinations/nearby
/api/v1/destinations/search
/api/v1/districts/{id}/destinations
/api/v1/transport/hubs
/api/v1/transport/routes
/api/v1/transport/services
/api/v1/transport/trains
/api/v1/transport/fares
/api/v1/journeys/plan
/api/v1/maps/layers
/api/v1/maps/districts/{id}
```

Adapt endpoint naming to the current API conventions.

## 10.1 Destination discovery UI

Must support:

-   Bangladesh map
-   Division/district/upazila filters
-   Search by Bangla and English names
-   Category filter
-   Destination cards
-   Destination details
-   Map markers
-   Nearby attractions
-   Source/verification display where appropriate
-   Mobile-friendly layout

## 10.2 District-to-district route UI

Show:

-   Origin and destination
-   Road distance with method/source
-   Available transport modes
-   Direct versus transfer journeys
-   Departure and arrival points
-   Operators
-   Duration and its status (scheduled, estimated, or variable)
-   Fare range or class-specific fares
-   Last checked date
-   Source link
-   Missing-data warning

Do not display a single "cheapest fare" if fare categories are not
comparable.

## 10.3 Train UI

Show:

-   Train name and number
-   Direction
-   Origin/destination stations
-   Ordered stops
-   Arrival/departure time
-   Weekly off day
-   Fare classes
-   Timetable validity
-   Official source and last checked date

## 10.4 Map UI

Show:

-   District boundaries
-   Destination markers
-   Layer controls
-   Map legend
-   Source attribution
-   Bangla/English language switch
-   A clear indication of which layers are available
-   Accessible alternatives for map content

------------------------------------------------------------------------

# 11. RAG and AI Integration

The structured database and RAG system must work together.

## Structured database should answer:

-   What is the current verified fare?
-   Which trains serve this station?
-   What time does a service depart?
-   How far is the destination by the selected route engine?
-   Which attractions are in this district?
-   Which hubs are connected?

## RAG should answer:

-   What is special about this destination?
-   What should visitors know before visiting?
-   What local customs or rules apply?
-   What is the historical background?
-   How should a visitor prepare for a seasonal trip?
-   What do official notices and travel guides say?

## RAG ingestion rules

-   Preserve source URL, title, publisher, date, retrieval timestamp,
    license, and document ID.
-   Chunk by meaningful section, not arbitrary tiny fragments only.
-   Keep source metadata on every chunk.
-   Deduplicate documents.
-   Re-index when the source version changes.
-   Do not let an old RAG chunk override a newer structured fare or
    schedule.
-   Provide source references in answers.
-   If sources conflict, explain the conflict rather than choosing an
    unsupported answer.
-   Clearly label generated summaries as summaries of the cited source.

------------------------------------------------------------------------

# 12. Testing and Quality Assurance

Build automated tests for the pipeline, API, and map outputs.

## 12.1 Data tests

-   Schema validation
-   Null/required field checks
-   Coordinate range checks
-   District/upazila spatial consistency
-   Duplicate detection
-   Source URL validity where practical
-   License metadata completeness
-   Fare currency and non-negative amount
-   Schedule validity and overnight journeys
-   Stop order consistency
-   Effective-date consistency
-   Bangla Unicode integrity
-   Stale record detection

## 12.2 Pipeline tests

-   Dry-run does not publish data.
-   Re-running the same import does not duplicate records.
-   A failed fetch does not erase old curated data.
-   A changed source creates a version/change event.
-   Invalid records are rejected or queued for review.
-   Raw source snapshots remain immutable.
-   Every published factual record has required provenance.
-   Ingestion errors are visible in the report.

## 12.3 GIS tests

-   District polygons are valid.
-   District boundaries do not have unexplained gaps/overlaps.
-   Coordinate reference systems are recorded.
-   Geometry operations use an appropriate CRS.
-   Destination points are assigned to expected administrative areas.
-   Raster coverage includes the intended map extent.
-   Map layers use compatible CRS and valid geometries.
-   Neighbor relationships are derived from polygon adjacency, not text
    guesses.
-   Map exports contain credits and version metadata.

## 12.4 Manual acceptance tests

Before releasing a batch:

-   Inspect at least one district from each division.
-   Inspect one coastal/island district.
-   Inspect one riverine district.
-   Inspect one hill district.
-   Inspect one low-relief district.
-   Verify a sample of destinations against original sources.
-   Verify a sample of fares and train schedules directly against
    official/operator sources.
-   Check Bangla font rendering and label placement.

------------------------------------------------------------------------

# 13. Phased Implementation Plan

Do not attempt all datasets and 64 map exports in one task. Implement
and verify in phases.

## Phase 0 --- Repository and source audit

Tasks:

1.  Inspect the existing Vromon repository.
2.  Identify current technology stack and features.
3.  Identify existing database tables and API contracts.
4.  Inventory current data and classify it as demo, unverified, or
    sourced.
5.  Search for Bangladesh official and open datasets.
6.  Investigate the example websites as references.
7.  Create a source catalog with URLs, access method, license, coverage,
    and limitations.
8.  Identify sources that need manual permission or direct contact.
9.  Produce a gap analysis and implementation plan.

Deliverables:

-   `docs/SOURCE_CATALOG.md`
-   `docs/REPOSITORY_AUDIT.md`
-   `docs/DATA_GAP_ANALYSIS.md`
-   Source registry
-   A short report of what is genuinely obtainable

**Acceptance:** No claim of API/download access without a working test
or official documentation.

## Phase 1 --- Core geography and data model

Tasks:

1.  Set up or extend PostgreSQL/PostGIS.
2.  Create migrations for administrative units and boundaries.
3.  Import a licensed/official Bangladesh administrative boundary
    dataset.
4.  Validate district and upazila coverage.
5.  Create destination, source, claim, media, and verification tables.
6.  Create data dictionary and validation schemas.
7.  Build seed/import scripts.
8.  Add Bangla/English name handling.

Deliverables:

-   Database migrations
-   Administrative geography import
-   Data dictionary
-   Source/provenance schema
-   Automated validation tests

**Acceptance:** The administrative hierarchy and boundaries are
traceable to a named source and pass geometry checks.

## Phase 2 --- Tourist destination ingestion

Tasks:

1.  Build connectors for sources with permitted access.
2.  Import real destination records.
3.  Preserve source-native names and IDs.
4.  Normalize names and categories.
5.  Resolve division/district/upazila.
6.  Validate coordinates.
7.  Detect duplicates.
8.  Create a human review queue.
9.  Add destination images only where usage rights are clear.
10. Publish only approved records.

Deliverables:

-   Destination ingestion connectors
-   Staging and curated datasets
-   Duplicate review workflow
-   District destination API
-   Destination quality report

**Acceptance:** Every published destination has a source trail and
validated location. No fabricated destination records.

## Phase 3 --- 3D GIS proof of concept

Do not generate all 64 maps yet.

Choose a representative pilot set:

-   One hill district
-   One coastal/island district
-   One riverine district
-   One mostly flat district

Tasks:

1.  Acquire boundary data.
2.  Acquire DEM data.
3.  Acquire river and road layers.
4.  Import destination points.
5.  Generate hillshade.
6.  Create a QGIS or scripted map layout.
7.  Generate one English and one Bangla map for each pilot district.
8.  Review accuracy, visual quality, fonts, and licensing.
9.  Test interactive map rendering.
10. Document the reproducible process.

Deliverables:

-   GIS processing scripts
-   Layer registry
-   Map style/layout templates
-   Pilot map exports
-   Map credits
-   Interactive map proof of concept

**Acceptance:** A map can be regenerated from versioned input data
without manual redrawing, and every factual layer has attribution.

## Phase 4 --- Transport hubs and routes

Tasks:

1.  Import verified railway stations.
2.  Import verified bus terminals/stops where available.
3.  Import airports.
4.  Import launch terminals, ferry ghats, and river ports.
5.  Normalize hub names and coordinates.
6.  Create operator records.
7.  Model route corridors and ordered stops.
8.  Import official or operator-confirmed services.
9.  Add route geometry from a permitted routing source.
10. Separate scheduled services from calculated journeys.

Deliverables:

-   Transport hub database
-   Operator database
-   Route/service schemas
-   Hub search API
-   Transport coverage report

**Acceptance:** Every published service is supported by a source;
calculated paths are labeled as calculated.

## Phase 5 --- Train schedules and fares

Tasks:

1.  Investigate official Bangladesh Railway timetable files and notices.
2.  Store raw source documents.
3.  Parse train names, numbers, directions, stops, times, and off days.
4.  Model timetable effective dates.
5.  Parse class-wise fares where an authoritative source exists.
6.  Validate sample records against official information.
7.  Build a schedule update workflow.
8.  Display source and last-verified dates.

Deliverables:

-   Train/station database
-   Versioned timetable import
-   Fare-class data
-   Train search and detail API
-   Verification report

**Acceptance:** No guessed times, train numbers, off days, or fares.
Direction and effective dates are preserved.

## Phase 6 --- Bus, road, air, and water transport fares

Implement each mode independently because its data sources and update
patterns differ.

### Bus

-   Official fare rules/notifications
-   Operator-specific routes and fares
-   AC/non-AC and seat categories
-   Boarding and drop-off points
-   Effective dates

### Road

-   Road network source and version
-   Routing engine/provider
-   Distance and duration calculation
-   Route alternatives
-   Toll/ferry information only where sourced

### Air

-   Domestic airports and route coverage
-   Airline-published schedules
-   Date-specific fares only when lawfully accessible
-   Baggage and tax notes where available

### Water transport

-   Launch/boat/ferry routes
-   Terminals and ghats
-   Operator and service
-   Schedule and seasonal status
-   Class/cabin fare

Deliverables:

-   Mode-specific connectors
-   Fare schema and API
-   Journey planner integration
-   Data freshness monitoring

**Acceptance:** Each fare is identified as official, operator-published,
ticket-platform displayed, confirmed, historical, or estimated.
Estimates are never presented as confirmed fares.

## Phase 7 --- District maps at Bangladesh scale

After the pilot is approved:

1.  Confirm complete district boundary coverage.
2.  Confirm DEM coverage and license.
3.  Confirm river and destination layers.
4.  Generate all district map variants using templates.
5.  Generate Bangla and English versions only when labels have been
    reviewed.
6.  Run batch QA.
7.  Produce map index pages and downloads if desired.
8.  Record data version and credits for every map.

Deliverables:

-   64 district map outputs
-   Up to 128 language variants
-   Interactive district map
-   Map metadata and credits
-   Regeneration command

**Acceptance:** All maps are generated from real GIS data, and missing
layers are omitted rather than invented.

## Phase 8 --- Accommodation, food, facilities, and travel knowledge

Tasks:

1.  Add legally sourced accommodation and restaurant records.
2.  Add district food specialties with evidence.
3.  Add public facilities and emergency services from suitable sources.
4.  Import official travel notices and guides into RAG.
5.  Add source metadata and freshness policies.
6.  Build moderation and correction workflows.

**Acceptance:** Public-facing records are sourced, appropriately
licensed, and have a review path.

## Phase 9 --- RAG, search, and journey planner integration

Tasks:

1.  Connect structured search to PostgreSQL/PostGIS.
2.  Connect RAG to source-backed travel documents.
3.  Ensure current fares and schedules come from structured data.
4.  Implement route planning using actual network connections.
5.  Support transfers and multi-mode journeys only when data exists.
6.  Return source references and freshness status.
7.  Test questions in Bangla and English.

**Acceptance:** The assistant does not invent routes, fares, schedules,
or destination details when data is absent.

## Phase 10 --- Operations and continuous updates

Tasks:

1.  Schedule permitted source checks.
2.  Monitor failed connectors.
3.  Detect source changes.
4.  Create stale-data alerts.
5.  Generate weekly quality reports.
6.  Review conflicts and user-submitted corrections.
7.  Back up database and raw artifacts.
8.  Document restore procedures.

**Acceptance:** The data platform can be maintained by the team without
manually repeating the entire import process.

------------------------------------------------------------------------

# 14. Recommended Technology Choices

These are recommendations, not permission to rewrite an existing working
stack.

  -----------------------------------------------------------------------
  Requirement                         Recommended options
  ----------------------------------- -----------------------------------
  Main relational database            PostgreSQL

  Geospatial database                 PostGIS

  Data ingestion                      Python

  Data validation                     Pydantic / JSON Schema

  Tabular processing                  Pandas or Polars

  GIS processing                      GeoPandas, Shapely, GDAL, Rasterio,
                                      PyProj

  GIS desktop QA                      QGIS

  Interactive web maps                MapLibre GL JS

  Advanced visualization              Deck.gl or CesiumJS only if
                                      justified

  Road routing                        OSRM, GraphHopper, Valhalla, or a
                                      licensed provider after evaluation

  API                                 Reuse existing backend; otherwise
                                      choose a maintainable framework

  Object storage                      S3-compatible storage or equivalent

  Job scheduling                      Existing queue/scheduler; otherwise
                                      a simple reliable job runner
                                      initially

  Search                              PostgreSQL full-text search
                                      initially; add specialized search
                                      only when needed

  RAG                                 Reuse existing RAG stack; keep
                                      structured facts in SQL

  Monitoring                          Structured logs, job status, error
                                      reports, freshness metrics
  -----------------------------------------------------------------------

Before selecting a provider, verify current documentation, pricing, rate
limits, coverage in Bangladesh, terms, and license. Do not assume a free
tier is suitable for production.

------------------------------------------------------------------------

# 15. Security, Privacy, and Operational Safety

-   Keep API keys and credentials in environment variables or a secret
    manager.
-   Never commit secrets.
-   Respect source rate limits.
-   Cache responses where terms permit.
-   Do not collect private personal data about operators or travelers.
-   Do not expose internal admin endpoints publicly.
-   Validate uploads and source files.
-   Scan or safely handle untrusted documents.
-   Keep audit logs for data changes.
-   Back up PostgreSQL and object storage.
-   Use role-based access for publishing and review.
-   Make data correction/reporting available to users.

------------------------------------------------------------------------

# 16. Admin and Data Operations Dashboard

Build an internal dashboard for the team to see:

-   Total destinations by district
-   Destinations awaiting review
-   Missing coordinates
-   Duplicate candidates
-   Sources and their status
-   Last successful source fetch
-   Failed ingestion jobs
-   Stale fares
-   Stale train schedules
-   Missing fare classes
-   Districts with low destination coverage
-   Map layer coverage
-   Map generation status
-   Records with missing licenses or attribution
-   User-submitted corrections awaiting review

Do not use destination count as a proxy for quality. Show source
coverage and verification status alongside counts.

------------------------------------------------------------------------

# 17. Reporting Format for the AI Agent

At the end of each phase, report:

1.  What was inspected.
2.  What was implemented.
3.  Files created or modified.
4.  Database migrations added.
5.  Data sources actually accessed.
6.  Number of raw records fetched.
7.  Number of records parsed.
8.  Number accepted, rejected, duplicated, and awaiting review.
9.  Which fields are still unavailable.
10. License/terms concerns.
11. Tests run and their results.
12. Screenshots or sample outputs where useful.
13. Known limitations.
14. Exact next steps.

Never report a task as completed merely because code was generated. Run
it and show evidence.

------------------------------------------------------------------------

# 18. First Assignment to Codex

**Do not begin by filling the database with sample or dummy travel
data.**

Start with Phase 0 only.

The first task is to audit the repository and discover real Bangladesh
data sources.

Required actions:

1.  Inspect the current Vromon codebase.
2.  Identify the existing stack and implemented features.
3.  Inventory all current travel records and identify demo/unverified
    data.
4.  Find official and open sources for Bangladesh administrative
    geography, tourist destinations, transport hubs, trains, bus
    routes/fares, water transport, aviation, roads, rivers, and
    elevation.
5.  Investigate the four reference URLs in Section 4.3.
6.  For every source, test whether an actual download/API/document
    exists.
7.  Check terms, license, attribution, and access limits.
8.  Do not scrape or bulk-copy restricted content.
9.  Create the source catalog and data gap analysis.
10. Recommend a prioritized acquisition plan based on real availability
    and reliability.

### Phase 0 must produce

-   `docs/REPOSITORY_AUDIT.md`
-   `docs/SOURCE_CATALOG.md`
-   `docs/DATA_GAP_ANALYSIS.md`
-   `data-platform/source-registry/sources.yaml`
-   `docs/PHASE_1_PLAN.md`

### Stop and ask for human review if

-   A source's license or terms are unclear.
-   A site blocks automated access.
-   A source requires an account, payment, or agreement.
-   Two authoritative sources conflict.
-   A dataset appears to contain personal or sensitive information.
-   A proposed import would overwrite existing production data.
-   A schema migration could break existing features.

After Phase 0, present the report and wait for approval before
implementing Phase 1.

------------------------------------------------------------------------

# 19. Product Principles to Preserve

1.  Bangladesh first. Do not spend time collecting world travel data in
    this phase.
2.  Correctness before quantity.
3.  Source evidence before publication.
4.  Missing data is better than fabricated data.
5.  Keep raw source files and provenance.
6.  Separate official facts, operator facts, calculated results, and
    community data.
7.  Version fares and timetables.
8.  Use real GIS data for maps.
9.  Generate maps automatically from reusable templates.
10. Support Bangla and English.
11. Design for all 64 districts, but publish only what has passed
    quality checks.
12. Keep structured travel facts separate from RAG narrative knowledge.
13. Respect copyright, licenses, terms, and attribution.
14. Make every important result auditable and reproducible.

------------------------------------------------------------------------

# 20. Final Vision

The intended result is not simply a tourist-place listing website.

Vromon should have a dependable Bangladesh travel data platform
underneath it:

-   A geographic master dataset for Bangladesh.
-   A verified tourist destination catalog.
-   A connected transport network.
-   Source-backed bus, train, air, and water transport information.
-   Versioned fares and schedules.
-   A route calculation system.
-   Accommodation, local food, and facility information where reliable
    sources exist.
-   Interactive Bangladesh maps.
-   Automated 3D district map generation.
-   A source-traceable travel knowledge base for RAG.
-   A continuous data quality and update pipeline.

**The most important instruction:** Build the pipeline so that every
fact can be traced to where it came from, when it was collected, how it
was checked, and whether it is still current. That is what will make
Vromon trustworthy.
