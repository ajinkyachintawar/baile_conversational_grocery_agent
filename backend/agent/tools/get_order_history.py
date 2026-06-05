from langchain_core.tools import tool
from backend.db.supabase_client import get_client


@tool
def get_order_history(session_id: str, limit: int = 3) -> dict:
    """
    Retrieve past orders for this session.
    Use when user says 'same as last time' or references a previous order.
    """
    try:
        limit = int(limit)  # LLM may pass as string
        db = get_client()
        orders = (
            db.table("orders")
            .select("*")
            .eq("session_id", session_id)
            .order("placed_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )

        if not orders:
            return {"orders": [], "message": "No previous orders found for this session."}

        # Enrich with item count and total
        result = []
        for order in orders:
            items = order.get("items", [])
            result.append({
                "order_id": order["id"],
                "placed_at": order["placed_at"],
                "store_id": order.get("store_id"),
                "total_eur": order.get("total_eur"),
                "status": order.get("status"),
                "item_count": len(items),
                "items": items,
            })

        return {"orders": result, "count": len(result)}

    except Exception as e:
        return {"orders": [], "error": str(e), "message": "Failed to retrieve order history"}
