from typing import Annotated
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from backend.db.supabase_client import get_client


@tool
def get_order_history(
    state: Annotated[dict, InjectedState()],
    limit: int = 3,
) -> dict:
    """
    Retrieve past orders for this session.
    Use when user says 'same as last time' or references a previous order.
    Do NOT pass session_id — it is injected automatically.
    """
    try:
        session_id: str = state["session_id"]
        limit = int(limit)
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
