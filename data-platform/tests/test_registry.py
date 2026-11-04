"""The source registry is valid and honest about each source's terms."""

from vromon_data import registry


def test_registry_is_valid():
    assert registry.validate(registry.load()) == []


def test_every_source_has_a_licence_or_says_unknown():
    for s in registry.load():
        if s["recommended_use"] in ("production", "enrichment"):
            assert s.get("license_name"), s["source_id"]


def test_reference_products_are_never_data_sources():
    for s in registry.load():
        if s["source_type"] == "reference_product":
            assert s["recommended_use"] == "reference_only"


def test_validate_catches_production_without_permission():
    bad = [{
        "source_id": "x", "source_name": "x", "organization": "x", "source_type": "official_web_pages",
        "access_method": "manual", "terms_review_status": "permission_required",
        "reliability_class": "official_government", "recommended_use": "production",
    }]
    assert any("production use" in p for p in registry.validate(bad))
