import re
from typing import Annotated, Literal
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from backend.db.supabase_client import get_client

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _to_price(v) -> float | None:
    """Parse prices however the LLM mangles them: 4.99, "4.99", "€4.99", "4,99"."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"\d+(?:[.,]\d+)?", str(v))
    return float(m.group().replace(",", ".")) if m else None


def _add_one(db, session_id: str, store_id, product_id, product_name, price_eur, quantity) -> None:
    """Insert a single cart item, auto-filling price/store from products table."""
    # LLM often puts the product NAME in product_id ("olive oil") — swap it back
    if not product_name and product_id and not _UUID_RE.match(str(product_id)):
        product_name, product_id = str(product_id), None
    price_eur = _to_price(price_eur)
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        quantity = 1

    if (price_eur is None or store_id is None) and (product_id or product_name):
        try:
            q = db.table("products").select("id, name, price_eur, store_id")
            if product_id:
                q = q.eq("id", product_id)
            else:
                q = q.ilike("name", f"%{product_name}%")
            if store_id:
                q = q.eq("store_id", store_id)
            rows = q.limit(1).execute().data
            if rows:
                product_id = product_id or rows[0]["id"]
                price_eur = price_eur or rows[0]["price_eur"]
                store_id = store_id or rows[0]["store_id"]
                product_name = rows[0]["name"]  # use canonical name
        except Exception:
            pass  # proceed with whatever we have

    db.table("cart_items").insert({
        "session_id": session_id,
        "store_id": store_id,
        "product_id": product_id,
        "product_name": product_name,
        "price_eur": price_eur,
        "quantity": quantity,
        "unit": None,
    }).execute()


def _get_cart(session_id: str) -> dict:
    db = get_client()
    rows = (
        db.table("cart_items")
        .select("*")
        .eq("session_id", session_id)
        .order("added_at")
        .execute()
        .data
    )
    items = rows or []
    by_store: dict[str, list] = {}
    total = 0.0
    for item in items:
        sid = item["store_id"] or "unknown"
        by_store.setdefault(sid, []).append(item)
        if item.get("price_eur") and item.get("quantity"):
            total += float(item["price_eur"]) * int(item["quantity"])

    return {"items": items, "by_store": by_store, "total_eur": round(total, 2), "item_count": len(items)}


@tool
def manage_cart(
    action: Literal["add", "remove", "update", "clear", "rebuild", "get"],
    state: Annotated[dict, InjectedState()],
    store_id: str | None = None,
    product_id: str | None = None,
    product_name: str | None = None,
    price_eur: float | str | None = None,  # str allowed: Llama sometimes emits "2.50"
    quantity: int | str = 1,
    order_id: str | None = None,
    items: list[dict] | None = None,
) -> dict:
    """
    Manage the user's cart. Actions: add, remove, update qty, clear, rebuild from order, get current state.
    To add MULTIPLE products, use action="add" with items=[{"product_name", "store_id", "price_eur", "quantity"}, ...]
    in ONE call — never make one call per product.
    Always return the full current cart after any mutation.
    Do NOT pass session_id — it is injected automatically.
    """
    try:
        session_id: str = state["session_id"]
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            quantity = 1
        price_eur = _to_price(price_eur)
        db = get_client()

        # Ensure session exists
        existing = db.table("sessions").select("id").eq("id", session_id).execute()
        if not existing.data:
            db.table("sessions").insert({"id": session_id}).execute()

        if action == "get":
            return _get_cart(session_id)

        elif action == "add":
            if items and isinstance(items, list):
                for it in items:
                    if not isinstance(it, dict) or not (it.get("product_name") or it.get("product_id")):
                        continue
                    _add_one(
                        db, session_id,
                        it.get("store_id"), it.get("product_id"),
                        it.get("product_name"), it.get("price_eur"),
                        it.get("quantity", 1),
                    )
            elif product_name or product_id:
                _add_one(db, session_id, store_id, product_id, product_name, price_eur, quantity)
            else:
                return {"error": "product_name (or items list) is required for add action"}

        elif action == "remove":
            if not product_name and not product_id:
                return {"error": "product_name or product_id required for remove"}
            query = db.table("cart_items").delete().eq("session_id", session_id)
            if product_id:
                query = query.eq("product_id", product_id)
            else:
                query = query.ilike("product_name", f"%{product_name}%")
            query.execute()

        elif action == "update":
            if not product_name and not product_id:
                return {"error": "product_name or product_id required for update"}
            query = db.table("cart_items").update({"quantity": quantity}).eq("session_id", session_id)
            if product_id:
                query = query.eq("product_id", product_id)
            else:
                query = query.ilike("product_name", f"%{product_name}%")
            query.execute()

        elif action == "clear":
            db.table("cart_items").delete().eq("session_id", session_id).execute()

        elif action == "rebuild":
            if not order_id:
                return {"error": "order_id required for rebuild action"}
            order = db.table("orders").select("*").eq("id", order_id).execute()
            if not order.data:
                return {"error": f"Order {order_id} not found"}
            db.table("cart_items").delete().eq("session_id", session_id).execute()
            items = order.data[0].get("items", [])
            for item in items:
                db.table("cart_items").insert({
                    "session_id": session_id,
                    "store_id": item.get("store_id"),
                    "product_id": item.get("product_id"),
                    "product_name": item["product_name"],
                    "price_eur": item.get("price_eur"),
                    "quantity": item.get("quantity", 1),
                }).execute()

        return _get_cart(session_id)

    except Exception as e:
        return {"error": str(e), "message": "Cart operation failed"}
