from langchain_core.tools import tool
from backend.db.supabase_client import get_client
from backend.agent.tools._nim_client import embed

_ALL_STORES = ["tesco_phibsboro", "patel_grocery", "global_foods"]
_STORE_NAMES = {
    "tesco_phibsboro": "Tesco Phibsborough",
    "patel_grocery": "Patel's Asian Grocery",
    "global_foods": "Global Foods Smithfield",
}


@tool
def compare_stores(product_names: list[str]) -> dict:
    """
    Price a basket of items across all stores.
    Returns a matrix: product x store with prices, availability, and basket totals.
    Use when user wants to know which store is cheapest for their list.
    """
    try:
        db = get_client()
        matrix: dict[str, dict] = {}

        for name in product_names:
            embedding = embed(name)
            matrix[name] = {"stores": {}}

            for store_id in _ALL_STORES:
                result = db.rpc(
                    "match_products",
                    {"query_embedding": embedding, "match_count": 1, "filter_store": store_id},
                ).execute()

                if result.data:
                    row = result.data[0]
                    if float(row.get("similarity", 0)) > 0.3:
                        matrix[name]["stores"][store_id] = {
                            "product_id": row["id"],
                            "matched_name": row["name"],
                            "price_eur": float(row["price_eur"]) if row["price_eur"] else None,
                            "unit": row.get("unit"),
                            "available": True,
                        }
                    else:
                        matrix[name]["stores"][store_id] = {"available": False}
                else:
                    matrix[name]["stores"][store_id] = {"available": False}

        totals: dict[str, float | None] = {s: 0.0 for s in _ALL_STORES}
        for name, data in matrix.items():
            for store_id in _ALL_STORES:
                store_data = data["stores"].get(store_id, {})
                if not store_data.get("available", False) or store_data.get("price_eur") is None:
                    totals[store_id] = None
                elif totals[store_id] is not None:
                    totals[store_id] += store_data["price_eur"]  # type: ignore[operator]

        totals_rounded = {
            _STORE_NAMES[s]: round(v, 2) if v is not None else None
            for s, v in totals.items()
        }
        complete = {k: v for k, v in totals_rounded.items() if v is not None}
        cheapest_store = min(complete, key=lambda k: complete[k]) if complete else None

        return {
            "matrix": matrix,
            "store_names": _STORE_NAMES,
            "basket_totals": totals_rounded,
            "cheapest_store": cheapest_store,
            "items_compared": product_names,
        }

    except Exception as e:
        return {"matrix": {}, "error": str(e), "message": "Price comparison failed"}
