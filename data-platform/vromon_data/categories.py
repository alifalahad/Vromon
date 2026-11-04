"""
Vromon attraction categories and how Wikidata types map onto them.

`app_category` is the trip planner's interest category (the `places.category` values
the app already uses). Bangla category names are Vromon's UI labels (vromon_curated)
and should be checked by a Bangla reviewer like other UI text.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.catalog import AttractionCategory

# code, English, Bangla, app category
CATEGORIES: list[tuple[str, str, str, str]] = [
    ("beach", "Beaches", "সমুদ্রসৈকত", "Beach"),
    ("island", "Islands", "দ্বীপ", "Nature"),
    ("waterfall", "Waterfalls", "ঝর্ণা ও জলপ্রপাত", "Nature"),
    ("lake", "Lakes", "হ্রদ ও লেক", "Nature"),
    ("river_wetland", "Rivers, haors and wetlands", "নদী, হাওর ও জলাভূমি", "Nature"),
    ("hill_mountain", "Hills and mountains", "পাহাড় ও পর্বত", "Nature"),
    ("forest_protected", "Forests and protected areas", "বন ও সংরক্ষিত এলাকা", "Nature"),
    ("tea_garden", "Tea gardens", "চা বাগান", "Nature"),
    ("park_garden", "Parks and gardens", "পার্ক ও উদ্যান", "Family"),
    ("zoo_safari", "Zoos and safari parks", "চিড়িয়াখানা ও সাফারি পার্ক", "Family"),
    ("amusement", "Amusement and recreation", "বিনোদন কেন্দ্র", "Family"),
    ("archaeological", "Archaeological sites", "প্রত্নতাত্ত্বিক স্থান", "History"),
    ("historic_building", "Historic buildings", "ঐতিহাসিক স্থাপনা", "History"),
    ("monument", "Monuments and memorials", "স্মৃতিস্তম্ভ ও স্মারক", "History"),
    ("museum", "Museums", "জাদুঘর", "Culture"),
    ("religious", "Religious sites", "ধর্মীয় স্থান", "Culture"),
    ("viewpoint", "Viewpoints", "দর্শনীয় দৃশ্য", "Scenic"),
    ("market", "Markets", "বাজার", "Shopping"),
    ("other", "Other attractions", "অন্যান্য দর্শনীয় স্থান", "Scenic"),
]

# Wikidata class → category, most specific first (an item takes the first that matches)
WIKIDATA_CLASSES: list[tuple[str, str]] = [
    ("Q40080", "beach"), ("Q23442", "island"), ("Q34038", "waterfall"),
    ("Q2259780", "tea_garden"), ("Q43501", "zoo_safari"), ("Q194195", "amusement"),
    ("Q167346", "park_garden"), ("Q46169", "forest_protected"), ("Q473972", "forest_protected"),
    ("Q4421", "forest_protected"), ("Q166735", "river_wetland"), ("Q170321", "river_wetland"),
    ("Q23397", "lake"), ("Q131681", "lake"), ("Q39816", "hill_mountain"), ("Q54050", "hill_mountain"),
    ("Q8502", "hill_mountain"), ("Q33506", "museum"), ("Q839954", "archaeological"), ("Q109607", "archaeological"),
    ("Q57821", "historic_building"), ("Q16560", "historic_building"), ("Q879050", "historic_building"),
    ("Q162875", "monument"), ("Q4989906", "monument"), ("Q5003624", "monument"),
    ("Q32815", "religious"), ("Q44539", "religious"), ("Q16970", "religious"), ("Q44613", "religious"),
    ("Q697295", "religious"), ("Q1370598", "religious"),
    ("Q1440300", "viewpoint"), ("Q1062074", "viewpoint"), ("Q6017969", "viewpoint"),
    ("Q22698", "park_garden"), ("Q1107656", "park_garden"),
    ("Q330284", "market"), ("Q570116", "other"),
]
# Natural features Wikidata often has by the thousand from gazetteer imports (unnamed peaks, forest
# blocks): kept only with a Bangla label, a Wikipedia article or a photo
GAZETTEER_PRONE = {"hill_mountain", "forest_protected", "river_wetland", "lake"}

APP_CATEGORY = {code: app for code, _, _, app in CATEGORIES}


def category_for(classes: list[str]) -> str | None:
    have = set(classes)
    for q, code in WIKIDATA_CLASSES:
        if q in have:
            return code
    return None


def ensure(session: Session) -> None:
    for i, (code, en, bn, app) in enumerate(CATEGORIES):
        row = session.get(AttractionCategory, code)
        if row is None:
            session.add(AttractionCategory(code=code, name_en=en, name_bn=bn, app_category=app, sort_order=i))
        else:
            row.name_en, row.name_bn, row.app_category, row.sort_order = en, bn, app, i
    session.flush()
