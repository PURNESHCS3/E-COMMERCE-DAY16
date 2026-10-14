import json
import os
import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Query,
    Request,
    Response,
)

from sqlalchemy import and_, case, func, literal_column, or_, text
from sqlalchemy.orm import Session

from app.database import get_db, settings
from app.ai_service import retrieve_catalog_context
from app.models import Product
from app.product_categories import (
    PRODUCT_CATEGORIES,
    UNCATEGORIZED_CATEGORY,
)
from app.schemas import ProductCreate, ProductResponse
from app.dependencies import get_admin_user
from app.redis_client import redis_client
from app.security import limiter


router = APIRouter(
    prefix="/api/products",
    tags=["Products"]
)


UPLOAD_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "uploads", "products")
)

os.makedirs(
    UPLOAD_DIR,
    exist_ok=True
)


# ============================================================
# REDIS CACHE SETTINGS
# ============================================================

PRODUCT_CACHE_KEY = "products:all:v3"

PRODUCT_CACHE_EXPIRE = 300  # 5 minutes


@router.get(
    "/semantic-search",
    response_model=list[ProductResponse],
)
@limiter.limit("30/minute")
def semantic_search_products(
    request: Request,
    response: Response,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = Query(None, max_length=80),
    db: Session = Depends(get_db),
):
    query = q.strip()
    if not query:
        return []

    normalized_category = (
        "Uncategorized" if category == UNCATEGORIZED_CATEGORY else category
    )
    _context, sources = retrieve_catalog_context(
        db,
        query,
        category=normalized_category,
        max_results=limit,
    )
    product_ids = [source["product_id"] for source in sources]
    if not product_ids:
        return []

    products = (
        db.query(Product)
        .filter(Product.id.in_(product_ids), Product.is_active.is_(True))
        .all()
    )
    products_by_id = {product.id: product for product in products}
    return [
        products_by_id[product_id]
        for product_id in product_ids
        if product_id in products_by_id
    ]


# ============================================================
# CREATE PRODUCT
# ============================================================

@router.post(
    "/",
    response_model=ProductResponse
)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):

    product = Product(
        name=product_data.name,
        description=product_data.description,
        features=product_data.features,
        category=product_data.category,
        price=product_data.price,
        stock=product_data.stock,
        image_url=product_data.image_url,
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    # Invalidate product cache
    redis_client.delete(PRODUCT_CACHE_KEY)

    return product


# ============================================================
# GET ALL PRODUCTS
# ============================================================

@router.get(
    "/",
    response_model=list[ProductResponse]
)
def get_products(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=100),
    category: str | None = Query(None, max_length=80),
):

    # --------------------------------------------------------
    # Check Redis cache
    # --------------------------------------------------------

    cached_products = (
        redis_client.get(PRODUCT_CACHE_KEY)
        if limit is None and category is None
        else None
    )

    if cached_products:

        print("PRODUCT CACHE HIT")

        return json.loads(cached_products)

    # --------------------------------------------------------
    # Cache miss → query PostgreSQL
    # --------------------------------------------------------

    print("PRODUCT CACHE MISS")

    products_query = db.query(Product).filter(Product.is_active == True)
    if category:
        if category == UNCATEGORIZED_CATEGORY:
            products_query = products_query.filter(Product.category.is_(None))
        else:
            products_query = products_query.filter(Product.category == category)
    if limit is not None:
        products_query = products_query.order_by(Product.id).offset(skip).limit(limit)
    products = products_query.all()

    # --------------------------------------------------------
    # Convert SQLAlchemy objects to dictionaries
    # --------------------------------------------------------

    product_data = []

    for product in products:

        product_data.append({
            "id": product.id,
            "name": product.name,
            "description": product.description,
            "features": product.features,
            "category": product.category,
            "price": product.price,
            "stock": product.stock,
            "image_url": product.image_url,
            "is_active": product.is_active
        })

    # --------------------------------------------------------
    # Store result in Redis
    # --------------------------------------------------------

    if limit is None and category is None:
        redis_client.set(
            PRODUCT_CACHE_KEY,
            json.dumps(product_data),
            ex=PRODUCT_CACHE_EXPIRE
        )

    return product_data


@router.get(
    "/search",
    response_model=list[ProductResponse],
)
@limiter.limit("30/minute")
def search_products(
    request: Request,
    response: Response,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = Query(None, max_length=80),
    db: Session = Depends(get_db),
):
    terms = [term for term in q.strip().lower().split() if term]
    if not terms:
        return []

    query = db.query(Product).filter(Product.is_active.is_(True))
    if category:
        if category == UNCATEGORIZED_CATEGORY:
            query = query.filter(Product.category.is_(None))
        else:
            query = query.filter(Product.category == category)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text(
                "SELECT set_config("
                "'pg_trgm.word_similarity_threshold', "
                ":threshold, true"
                ")"
            ),
            {"threshold": str(settings.PRODUCT_SEARCH_SIMILARITY_THRESHOLD)},
        )
        search_vector = literal_column(
            "to_tsvector("
            "'english', "
            "coalesce(products.name, '') || ' ' || "
            "coalesce(products.description, '')"
            ")"
        )
        ts_query = func.websearch_to_tsquery("english", q)
        prefix_terms = []
        fuzzy_terms = []
        for term in terms:
            escaped_term = (
                term.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            word_prefix = or_(
                Product.name.ilike(f"{escaped_term}%", escape="\\"),
                Product.name.ilike(f"% {escaped_term}%", escape="\\"),
            )
            if len(term) >= 5:
                word_prefix = or_(
                    word_prefix,
                    Product.description.ilike(f"{escaped_term}%", escape="\\"),
                    Product.description.ilike(f"% {escaped_term}%", escape="\\"),
                )
            prefix_terms.append(
                word_prefix
            )
            if len(term) >= 3:
                fuzzy_terms.append(
                    or_(
                        func.lower(Product.name).op("%>")(term),
                        func.lower(Product.description).op("%>")(term),
                    )
                )
            else:
                fuzzy_terms.append(None)
        partial_terms = [
            or_(prefix_term, fuzzy_terms[index])
            if fuzzy_terms[index] is not None
            else prefix_term
            for index, prefix_term in enumerate(prefix_terms)
        ]
        partial_match = and_(*partial_terms)
        match_conditions = [partial_match]
        if len(q.strip()) >= 3:
            match_conditions.append(search_vector.op("@@")(ts_query))
        name_similarity = sum(
            func.word_similarity(term, func.lower(Product.name))
            for term in terms
        )
        description_similarity = sum(
            func.word_similarity(
                term,
                func.lower(func.coalesce(Product.description, "")),
            )
            for term in terms
        )
        query = query.filter(or_(*match_conditions)).order_by(
            case(
                (Product.name.ilike(f"{terms[0]}%", escape="\\"), 0),
                else_=1,
            ),
            name_similarity.desc(),
            description_similarity.desc(),
            func.ts_rank(search_vector, ts_query).desc(),
            Product.name,
        )
    else:
        prefix_terms = []
        for term in terms:
            escaped_term = (
                term.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            word_prefix = or_(
                Product.name.ilike(f"{escaped_term}%", escape="\\"),
                Product.name.ilike(f"% {escaped_term}%", escape="\\"),
            )
            if len(term) >= 3:
                word_prefix = or_(
                    word_prefix,
                    Product.description.ilike(f"{escaped_term}%", escape="\\"),
                    Product.description.ilike(f"% {escaped_term}%", escape="\\"),
                )
            prefix_terms.append(word_prefix)
        query = query.filter(and_(*prefix_terms)).order_by(
            case((Product.name.ilike(f"{terms[0]}%"), 0), else_=1),
            Product.name,
        )

    return query.limit(limit).all()


@router.get("/categories", response_model=list[str])
def get_product_categories(db: Session = Depends(get_db)):
    has_uncategorized = (
        db.query(Product.id)
        .filter(Product.is_active.is_(True), Product.category.is_(None))
        .first()
        is not None
    )
    categories = list(PRODUCT_CATEGORIES)
    if has_uncategorized:
        categories.append(UNCATEGORIZED_CATEGORY)
    return categories


# ============================================================
# GET PRODUCT BY ID
# ============================================================

@router.get(
    "/{product_id}",
    response_model=ProductResponse
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product


# ============================================================
# UPDATE PRODUCT
# ============================================================

@router.put(
    "/{product_id}",
    response_model=ProductResponse
)
def update_product(
    product_id: int,
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.name = product_data.name
    product.description = product_data.description
    product.features = product_data.features
    product.category = product_data.category
    product.price = product_data.price
    product.stock = product_data.stock
    if "image_url" in product_data.model_fields_set:
        product.image_url = product_data.image_url

    db.commit()
    db.refresh(product)

    # Invalidate product cache
    redis_client.delete(PRODUCT_CACHE_KEY)

    return product


# ============================================================
# DELETE PRODUCT
# ============================================================

@router.delete(
    "/{product_id}"
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.is_active = False

    db.commit()

    # Invalidate product cache
    redis_client.delete(PRODUCT_CACHE_KEY)

    return {
        "message": "Product deleted successfully"
    }


# ============================================================
# UPLOAD PRODUCT IMAGE
# ============================================================

@router.post(
    "/{product_id}/image"
)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    # --------------------------------------------------------
    # Allowed image types
    # --------------------------------------------------------

    allowed_types = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    }

    if file.content_type not in allowed_types:

        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG and WebP images are allowed"
        )

    # --------------------------------------------------------
    # Generate unique filename
    # --------------------------------------------------------

    extension = allowed_types[file.content_type]

    filename = f"{uuid.uuid4()}.{extension}"

    filepath = os.path.join(
        UPLOAD_DIR,
        filename
    )

    # --------------------------------------------------------
    # Save file
    # --------------------------------------------------------

    content = await file.read()

    with open(filepath, "wb") as buffer:

        buffer.write(content)

    # --------------------------------------------------------
    # Save image URL
    # --------------------------------------------------------

    product.image_url = (
        f"/static/products/{filename}"
    )

    db.commit()
    db.refresh(product)

    # --------------------------------------------------------
    # Invalidate product cache
    # --------------------------------------------------------

    redis_client.delete(
        PRODUCT_CACHE_KEY
    )

    return {
        "message": "Image uploaded successfully",
        "image_url": product.image_url
    }