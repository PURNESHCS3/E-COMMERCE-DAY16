PRODUCT_CATEGORIES = (
    "Electronics",
    "Footwear",
    "Clothing",
    "Home & Kitchen",
    "Beauty & Personal Care",
    "Books",
    "Sports & Outdoors",
    "Toys & Games",
    "Accessories",
    "Grocery",
    "Other",
)

UNCATEGORIZED_CATEGORY = "Uncategorized"


def normalize_product_category(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None

    normalized = value.strip().casefold()
    return next(
        (category for category in PRODUCT_CATEGORIES if category.casefold() == normalized),
        None,
    )
