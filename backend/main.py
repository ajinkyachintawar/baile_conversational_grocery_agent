import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.agent.graph import agent
from backend.db.supabase_client import get_client

SSE_TIMEOUT = 120  # seconds before stream forcefully closes


def _safe_payload(obj) -> str:
    """json.dumps that can never raise — LangChain objects become strings."""
    return json.dumps(obj, default=str)


def _clean_tool_input(raw) -> dict | None:
    """Drop the InjectedState blob (raw conversation messages) from tool input
    before it goes over SSE — it's huge and not JSON-serializable."""
    if not isinstance(raw, dict):
        return raw
    return {k: v for k, v in raw.items() if k not in ("state", "messages")}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up Supabase connection
    get_client()
    yield


app = FastAPI(title="Baile API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Chrome extension origin + web app
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ──────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str


class OrderRequest(BaseModel):
    store_id: str | None = None


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.post("/sessions")
async def create_session():
    session_id = str(uuid.uuid4())
    db = get_client()
    db.table("sessions").insert({"id": session_id}).execute()
    return {"session_id": session_id}


@app.get("/stores")
async def list_stores():
    db = get_client()
    stores = db.table("stores").select("*").execute().data
    return {"stores": stores}


@app.get("/cart/{session_id}")
async def get_cart(session_id: str):
    db = get_client()
    items = (
        db.table("cart_items")
        .select("*")
        .eq("session_id", session_id)
        .order("added_at")
        .execute()
        .data
    )
    total = sum(
        float(i["price_eur"]) * int(i["quantity"])
        for i in items
        if i.get("price_eur") and i.get("quantity")
    )
    return {"session_id": session_id, "items": items, "total_eur": round(total, 2)}


@app.post("/orders/{session_id}")
async def place_order(session_id: str, body: OrderRequest):
    db = get_client()
    items = (
        db.table("cart_items")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    total = sum(
        float(i["price_eur"]) * int(i["quantity"])
        for i in items
        if i.get("price_eur") and i.get("quantity")
    )

    order = (
        db.table("orders")
        .insert({
            "session_id": session_id,
            "store_id": body.store_id,
            "items": items,
            "total_eur": round(total, 2),
            "status": "placed",
        })
        .execute()
        .data[0]
    )

    # Clear cart after checkout
    db.table("cart_items").delete().eq("session_id", session_id).execute()

    return {"order_id": order["id"], "total_eur": order["total_eur"], "status": "placed"}


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    from langchain_core.messages import HumanMessage

    async def event_generator():
        try:
            async with asyncio.timeout(SSE_TIMEOUT):
                async for event in agent.astream_events(
                    {
                        "messages": [HumanMessage(content=request.message)],
                        "session_id": request.session_id,
                        "cart": {},
                        "tool_calls_log": [],
                    },
                    version="v2",
                    config={"recursion_limit": 10},
                ):
                    event_name = event.get("event", "")

                    if event_name == "on_tool_start":
                        payload = _safe_payload({
                            "type": "tool_start",
                            "tool": event.get("name"),
                            "input": _clean_tool_input(event["data"].get("input")),
                        })
                        yield f"data: {payload}\n\n"

                    elif event_name == "on_tool_end":
                        raw_output = event["data"].get("output")
                        # ToolMessage → extract just the content string
                        if hasattr(raw_output, "content"):
                            output = raw_output.content
                        else:
                            output = raw_output
                        payload = _safe_payload({
                            "type": "tool_end",
                            "tool": event.get("name"),
                            "output": output,
                        })
                        yield f"data: {payload}\n\n"

                    elif event_name == "on_chat_model_stream":
                        chunk = event["data"].get("chunk")
                        content = getattr(chunk, "content", "") if chunk else ""
                        if content:
                            payload = json.dumps({"type": "text", "content": content})
                            yield f"data: {payload}\n\n"

                    elif event_name == "on_chain_end" and event.get("name") == "LangGraph":
                        output = event["data"].get("output", {})
                        cart = {}
                        # Pull latest cart from DB
                        try:
                            db = get_client()
                            cart_items = (
                                db.table("cart_items")
                                .select("*")
                                .eq("session_id", request.session_id)
                                .execute()
                                .data
                            )
                            total = sum(
                                float(i["price_eur"]) * int(i["quantity"])
                                for i in cart_items
                                if i.get("price_eur") and i.get("quantity")
                            )
                            cart = {"items": cart_items, "total_eur": round(total, 2)}
                        except Exception:
                            pass

                        payload = json.dumps({"type": "done", "cart": cart})
                        yield f"data: {payload}\n\n"

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Response timed out'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "baile"}
