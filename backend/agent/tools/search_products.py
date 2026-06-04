from langchain_core.tools import tool
from backend.db.supabase_client import get_client
from backend.agent.tools._nim_client import embed


@tool
def search_products(
    query: str,
    store_ids: list[str] | None = None,
    limit: int = 8,
) -> dict:
    """
    Search for products using semantic similarity across stores.
    Returns ranked products with prices per store.
    Use when user asks for specific items or describes what they want to cook.
    """
    try:
        embedding = embed(query)
        db = get_client()
        stores_to_search = store_ids or ["tesco_phibsboro", "patel_grocery", "global_foods"]

        all_rows: list[dict] = []
        for store_id in stores_to_search:
            result = db.rpc(
                "match_products",
                {"query_embedding": embedding, "match_count": limit, "filter_store": store_id},
            ).execute()
            all_rows.extend(result.data or [])

        if not all_rows:
            return {"products": [], "message": f"No products found for '{query}'"}

        grouped: dict[str, dict] = {}
        for row in all_rows:
            key = row["name"].lower().strip()
            if key not in grouped:
                grouped[key] = {
                    "name": row["name"],
                    "brand": row.get("brand"),
                    "category": row.get("category"),
                    "unit": row.get("unit"),
                    "stores": {},
                    "best_similarity": 0.0,
                }
            grouped[key]["stores"][row["store_id"]] = {
                "product_id": row["id"],
                "price_eur": float(row["price_eur"]) if row["price_eur"] else None,
                "in_stock": row.get("in_stock", True),
            }
            sim = float(row.get("similarity", 0))
            if sim > grouped[key]["best_similarity"]:
                grouped[key]["best_similarity"] = sim

        products = sorted(grouped.values(), key=lambda x: x["best_similarity"], reverse=True)[:limit]
        return {"products": products, "query": query, "stores_searched": stores_to_search}

    except Exception as e:
        return {"products": [], "error": str(e), "message": f"Search failed for '{query}'"}
