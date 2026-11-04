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
