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
def optimise_split(
    basket: list[dict],
    max_stores: int | str = 2,  # str allowed: Llama sometimes emits "2"
) -> dict:
    """
    Find the minimum-cost way to split a basket across N stores.
    Greedy algorithm: assign each item to the cheapest store that carries it.
    Returns split cart per store with totals and total savings vs single-store.
    basket format: [{"name": str, "quantity": int}]
    """
    try:
        max_stores = int(max_stores)  # LLM may pass as string
        db = get_client()
        item_prices: dict[str, dict] = {}

        for item in basket:
            name = item["name"]
            embedding = embed(name)
            item_prices[name] = {}

            for store_id in _ALL_STORES:
                result = db.rpc(
                    "match_products",
                    {"query_embedding": embedding, "match_count": 1, "filter_store": store_id},
                ).execute()

                if result.data:
                    row = result.data[0]
                    if float(row.get("similarity", 0)) > 0.3 and row.get("price_eur"):
                        item_prices[name][store_id] = {
                            "price_eur": float(row["price_eur"]),
                            "product_id": row["id"],
                            "matched_name": row["name"],
                            "unit": row.get("unit"),
                        }

        split: dict[str, list] = {s: [] for s in _ALL_STORES}
        not_found: list[str] = []

        for item in basket:
            name = item["name"]
            qty = item.get("quantity", 1)
            available = item_prices.get(name, {})

            if not available:
                not_found.append(name)
                continue

            cheapest_store = min(available, key=lambda s: available[s]["price_eur"])
            info = available[cheapest_store]
            split[cheapest_store].append({
                "name": name,
                "matched_name": info["matched_name"],
                "quantity": qty,
                "price_eur": info["price_eur"],
                "product_id": info["product_id"],
                "unit": info["unit"],
                "line_total": round(info["price_eur"] * qty, 2),
            })

        split_clean = {s: items for s, items in split.items() if items}
        store_totals = {s: round(sum(i["line_total"] for i in items), 2) for s, items in split_clean.items()}
        grand_total = round(sum(store_totals.values()), 2)

        single_store_totals: dict[str, float] = {}
        for store_id in _ALL_STORES:
            total = 0.0
            complete = True
            for item in basket:
                name = item["name"]
                qty = item.get("quantity", 1)
                if store_id in item_prices.get(name, {}):
                    total += item_prices[name][store_id]["price_eur"] * qty
                else:
                    complete = False
                    break
            if complete:
                single_store_totals[store_id] = round(total, 2)

        cheapest_single = min(single_store_totals.values()) if single_store_totals else None
        savings = round(cheapest_single - grand_total, 2) if cheapest_single else None

        return {
            "split": {
                _STORE_NAMES.get(s, s): {"store_id": s, "items": items, "subtotal_eur": store_totals[s]}
                for s, items in split_clean.items()
            },
            "grand_total_eur": grand_total,
            "savings_vs_single_store_eur": savings,
            "stores_used": len(split_clean),
            "not_found": not_found,
            "single_store_totals": {_STORE_NAMES.get(s, s): v for s, v in single_store_totals.items()},
        }

    except Exception as e:
        return {"split": {}, "error": str(e), "message": "Split optimisation failed"}
