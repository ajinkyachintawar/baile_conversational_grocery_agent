from typing import Annotated, Literal
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from backend.db.supabase_client import get_client


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
    price_eur: float | None = None,
    quantity: int = 1,
    order_id: str | None = None,
) -> dict:
    """
    Manage the user's cart. Actions: add, remove, update qty, clear, rebuild from order, get current state.
    Always return the full current cart after any mutation.
    Do NOT pass session_id — it is injected automatically.
    """
    try:
        session_id: str = state["session_id"]
        quantity = int(quantity)
        db = get_client()

        # Ensure session exists
        existing = db.table("sessions").select("id").eq("id", session_id).execute()
        if not existing.data:
            db.table("sessions").insert({"id": session_id}).execute()

        if action == "get":
            return _get_cart(session_id)

        elif action == "add":
            if not product_name:
                return {"error": "product_name is required for add action"}
            db.table("cart_items").insert({
                "session_id": session_id,
                "store_id": store_id,
                "product_id": product_id,
                "product_name": product_name,
                "price_eur": price_eur,
                "quantity": quantity,
                "unit": None,
            }).execute()

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
