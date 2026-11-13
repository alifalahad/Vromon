import unicodedata

from vromon_data.text import bn_to_latin, clean, match_key, name_similarity, slugify


def test_clean_is_nfc_and_keeps_none():
    decomposed = "বগুড়া"   # ড + nukta
    assert clean(decomposed) == unicodedata.normalize("NFC", decomposed)
    assert clean("বগুড়া") == clean(decomposed)  # precomposed ড় compares equal after NFC
    assert clean(None) is None
    assert clean("   ") is None
    assert clean(" Cox's   Bazar ") == "Cox's Bazar"


def test_match_key_crosses_scripts_and_spellings():
    assert match_key("সিলেট") == match_key("Sylhet")
    assert name_similarity("Bogura", "Bogra") >= 85
    assert name_similarity("Chattogram", "Chittagong") >= 75
    assert name_similarity("Sylhet", "Rajshahi") < 50
    assert match_key("Barishal District") == match_key("Barisal")


def test_transliteration_basic():
    assert bn_to_latin("ঢাকা") == "dhaka"


def test_slugify():
    assert slugify("Cox's Bazar") == "cox-s-bazar"
    assert slugify("Chapai Nawabganj") == "chapai-nawabganj"


def test_different_place_types_do_not_match():
    assert name_similarity("বাঘা জাদুঘর", "বাঘা মসজিদ") == 0
    assert name_similarity("বাঘা মসজিদ", "বাঘা মসজিদ") == 100
    assert name_similarity("দুর্গাসাগর দিঘী", "দুর্গাসাগর") == 100     # one name has no type word
    assert name_similarity("কুতুবদিয়া সমুদ্র সৈকত", "কক্সবাজার সমুদ্র সৈকত") < 88


# The backend's search folds names with the same code (app/core/names.py): one module, two users
BANGLADESHI_NAMES = ["Bogura", "Bogra", "বগুড়া", "Bagerhat", "বাগেরহাট", "Chittagong", "Chattogram", "চট্টগ্রাম",
                     "Barisal", "Barishal", "Jessore", "Jashore", "Comilla", "Cumilla", "Cox's Bazar", "কক্সবাজার",
                     "Govt. Brajalal College", "ব্রজলাল কলেজ", "Sonadanga", "সোনাডাঙ্গা", "Shah Jalal", "শাহজালাল",
                     "Guthia Mosque, Wazirpur, Barishal", "Buddha Dhatu Jadi (Golden Temple)"]


def test_the_backend_folds_names_the_same_way():
    from app.core import names
    from vromon_data import text

    assert text.match_key is names.match_key and text.name_similarity is names.name_similarity
    assert text.bn_to_latin is names.bn_to_latin and text.clean is names.clean
    for a in BANGLADESHI_NAMES:
        assert text.match_key(a) == names.match_key(a) and text.match_key(a, drop_generic=False) == names.match_key(a, drop_generic=False)
        for b in BANGLADESHI_NAMES:
            assert text.name_similarity(a, b) == names.name_similarity(a, b)
    # the keys the places index (step 5) stored, and the Bogura/Bagerhat pair the publisher keeps apart
    assert names.match_key("Bogura") == "bagara" and names.match_key("Bagerhat") == "bagarat"
    assert names.match_key("Bagerhat") == names.match_key("বাগেরহাট")
