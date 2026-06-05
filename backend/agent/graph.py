import json
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from backend.agent.state import AgentState
from backend.agent.tools import ALL_TOOLS

# Max chars of tool output fed back to the LLM (prevents token bloat)
# Frontend SSE stream receives the FULL output before this truncation runs
_MAX_TOOL_CONTENT = 800

load_dotenv()

SYSTEM_PROMPT = """You are Baile, a conversational grocery agent for Irish independent stores.
You help users find products, compare prices across stores, build carts, and handle substitutions.

Rules:
- Always use tools to get real data — never make up prices or availability
- After every cart change, confirm the new cart state to the user
- When comparing stores, always show the total basket cost per store
- Suggest split carts when it saves more than €1.00
- Be concise — one key insight per message, not paragraphs
- Use Irish store names naturally (Patel's, Global Foods, Tesco Phibsborough)
- When a user says "same as last time", use get_order_history first
- Currency always in euros with € symbol
- If an item isn't found, say so clearly and offer to search for alternatives
- Do NOT call tools for general capability questions like "what can you do?" — answer directly in text
- Do NOT call manage_cart unless the user explicitly wants to add, remove, or view their cart

Available stores:
- Tesco Phibsborough (tesco_phibsboro) — chain, closes 22:00
- Patel's Asian Grocery (patel_grocery) — independent, closes 21:00
- Global Foods Smithfield (global_foods) — independent, halal meat available, closes 20:30"""


# Primary: llama-3.3-70b-versatile (100k TPD) — best tool use quality
# Fallback: llama-3.1-8b-instant (500k TPD) — if daily limit hit
_PRIMARY_MODEL = "llama-3.3-70b-versatile"
_FALLBACK_MODEL = "llama-3.1-8b-instant"


def _make_llm(model: str = _PRIMARY_MODEL) -> ChatGroq:
    return ChatGroq(
        model=model,
        api_key=os.environ["GROQ_API_KEY"],
        temperature=0.2,
        max_tokens=1024,
    ).bind_tools(ALL_TOOLS)


_llm: ChatGroq | None = None
_llm_fallback: ChatGroq | None = None


def _get_llm(fallback: bool = False) -> ChatGroq:
    global _llm, _llm_fallback
    if fallback:
        if _llm_fallback is None:
            _llm_fallback = _make_llm(_FALLBACK_MODEL)
        return _llm_fallback
    if _llm is None:
        _llm = _make_llm(_PRIMARY_MODEL)
    return _llm


def _truncate_tool_messages(messages: list) -> list:
    """Truncate long ToolMessage content to stay within token budget."""
    result = []
    for msg in messages:
        if isinstance(msg, ToolMessage) and isinstance(msg.content, str) and len(msg.content) > _MAX_TOOL_CONTENT:
            try:
                # Try to produce a short JSON summary
                data = json.loads(msg.content)
                if isinstance(data, dict):
                    # Keep keys but truncate nested values
                    summary = {k: f"<{type(v).__name__} len={len(str(v))}>" if len(str(v)) > 100 else v
                               for k, v in list(data.items())[:8]}
                    short = json.dumps(summary)
                else:
                    short = msg.content[:_MAX_TOOL_CONTENT] + "…"
            except Exception:
                short = msg.content[:_MAX_TOOL_CONTENT] + "…"
            msg = ToolMessage(content=short, tool_call_id=msg.tool_call_id, name=msg.name)
        result.append(msg)
    return result


def call_model(state: AgentState) -> dict:
    system = SYSTEM_PROMPT + f"\n\nCurrent session_id: {state['session_id']}"
    messages = _truncate_tool_messages(state["messages"])
    full_messages = [SystemMessage(content=system)] + messages
    try:
        response = _get_llm(fallback=False).invoke(full_messages)
    except Exception as e:
        err = str(e)
        if "rate_limit_exceeded" in err or "429" in err:
            # Daily token limit hit on primary — fall back to smaller model
            response = _get_llm(fallback=True).invoke(full_messages)
        else:
            raise
    return {"messages": [response]}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


tool_node = ToolNode(ALL_TOOLS)


def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", tool_node)
    graph.add_edge("tools", "agent")
    graph.add_conditional_edges("agent", should_continue)
    graph.set_entry_point("agent")
    return graph.compile()


agent = build_graph()
