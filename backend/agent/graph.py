import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from backend.agent.state import AgentState
from backend.agent.tools import ALL_TOOLS

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

Available stores:
- Tesco Phibsborough (tesco_phibsboro) — chain, closes 22:00
- Patel's Asian Grocery (patel_grocery) — independent, closes 21:00
- Global Foods Smithfield (global_foods) — independent, halal meat available, closes 20:30"""


def _make_llm() -> ChatGroq:
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.environ["GROQ_API_KEY"],
        temperature=0.2,
        max_tokens=1024,
    ).bind_tools(ALL_TOOLS)


_llm: ChatGroq | None = None


def _get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = _make_llm()
    return _llm


def call_model(state: AgentState) -> dict:
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = _get_llm().invoke(messages)
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
