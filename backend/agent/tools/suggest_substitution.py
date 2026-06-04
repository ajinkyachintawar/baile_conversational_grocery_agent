from langchain_core.tools import tool
from backend.db.supabase_client import get_client
from backend.agent.tools._nim_client import embed


@tool
def suggest_substitution(
    product_name: str,
    constraint: str,
    store_id: str | None = None,
) -> dict:
    """
    Find alternative products matching a constraint (dietary, budget, availability, preference).
    Examples: swap ghee to butter, find dairy-free milk, find cheaper basmati.
    Returns top 3 alternatives ranked by relevance and price.
    """
    try:
        db = get_client()
        query_text = f"{product_name} {constraint} alternative substitute"
        embedding = embed(query_text)

        stores = [store_id] if store_id else ["tesco_phibsboro", "patel_grocery", "global_foods"]
        candidates: list[dict] = []
        seen_names: set[str] = {product_name.lower().strip()}

        for sid in stores:
            result = db.rpc(
                "match_products",
                {"query_embedding": embedding, "match_count": 10, "filter_store": sid},
            ).execute()

            for row in (result.data or []):
                name_key = row["name"].lower().strip()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)
                candidates.append({
                    "name": row["name"],
                    "brand": row.get("brand"),
                    "category": row.get("category"),
                    "price_eur": float(row["price_eur"]) if row["price_eur"] else None,
                    "unit": row.get("unit"),
                    "store_id": sid,
                    "product_id": row["id"],
                    "similarity": float(row.get("similarity", 0)),
                })

        if not candidates:
            return {
                "substitutes": [],
                "message": f"No substitutes found for '{product_name}' with constraint '{constraint}'",
            }

        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        return {"original": product_name, "constraint": constraint, "substitutes": candidates[:3]}

    except Exception as e:
        return {"substitutes": [], "error": str(e), "message": "Substitution search failed"}
