import { useEffect, useRef, useState, useCallback } from "react";
import type { Cart, CartItem, InjectionStatus, Message, ToolCall } from "../types";
import ChatView from "./ChatView";
import CartView from "./CartView";

type Tab = "chat" | "cart";
type ServerStatus = "checking" | "waking" | "ready";

export default function Popup() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [injectionStatus, setInjectionStatus] = useState<InjectionStatus>({ phase: "idle" });
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const activeMessageIdRef = useRef<string | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No SSE event for 60s while streaming → surface a timeout instead of silence
  const armWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      const id = activeMessageIdRef.current;
      if (!id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                streaming: false,
                content: m.content || "⚠️ No response after 60 seconds — the server may be busy. Please try again.",
              }
            : m
        )
      );
      activeMessageIdRef.current = null;
    }, 60_000);
  }, []);

  const disarmWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // ── Wake-up ping ──────────────────────────────────────────────────────────
  useEffect(() => {
    const API = "https://baile-conversational-grocery-agent.onrender.com";
    const start = Date.now();
    fetch(`${API}/health`)
      .then(() => {
        if (Date.now() - start > 3000) setServerStatus("waking");
        else setServerStatus("ready");
      })
      .catch(() => setServerStatus("waking"));

    // Poll until ready
    const interval = setInterval(() => {
      fetch(`${API}/health`)
        .then(() => { setServerStatus("ready"); clearInterval(interval); })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // ── Init session ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (serverStatus !== "ready") return;
    chrome.runtime.sendMessage({ type: "GET_SESSION" }, (res) => {
      if (res?.session_id) {
        setSessionId(res.session_id);
        // Restore cart
        chrome.runtime.sendMessage({ type: "GET_CART", session_id: res.session_id }, (r) => {
          if (r?.cart?.items?.length) setCart(r.cart);
        });
      }
    });
  }, [serverStatus]);

  // ── SSE listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const listener = (msg: { type: string; event?: { type: string; content?: string; tool?: string; input?: unknown; output?: string; cart?: Cart; message?: string }; current?: string; done?: number; total?: number; complete?: boolean }) => {
      if (msg.type === "SSE_EVENT" && msg.event) {
        handleSSEEvent(msg.event);
      }
      if (msg.type === "INJECT_PROGRESS") {
        if (msg.complete) {
          setInjectionStatus({ phase: "complete", itemsAdded: msg.total ?? 0 });
        } else {
          setInjectionStatus({
            phase: "injecting",
            current: msg.current ?? "",
            done: msg.done ?? 0,
            total: msg.total ?? 0,
          });
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSSEEvent = useCallback((event: { type: string; content?: string; tool?: string; input?: unknown; output?: string; cart?: Cart; message?: string }) => {
    // Any event = stream is alive; reset the timeout clock
    if (event.type === "done" || event.type === "error") disarmWatchdog();
    else armWatchdog();

    if (event.type === "text") {
      setMessages((prev) => {
        const id = activeMessageIdRef.current;
        if (!id) return prev;
        return prev.map((m) => {
          if (m.id !== id) return m;
          // Llama sometimes leaks raw tool-call syntax into text — hide it
          const raw = m.content + (event.content ?? "");
          const cleaned = raw.replace(/<function=[\s\S]*?(<\/function>|$)/g, "");
          return { ...m, content: cleaned };
        });
      });
    }

    if (event.type === "tool_start") {
      const toolCall: ToolCall = {
        id: `tc-${Date.now()}`,
        tool: event.tool ?? "",
        input: event.input,
        status: "running",
      };
      setMessages((prev) => {
        const id = activeMessageIdRef.current;
        if (!id) return prev;
        return prev.map((m) =>
          m.id === id
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
            : m
        );
      });
    }

    if (event.type === "tool_end") {
      setMessages((prev) => {
        const id = activeMessageIdRef.current;
        if (!id) return prev;
        return prev.map((m) =>
          m.id === id
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.tool === event.tool && tc.status === "running"
                    ? { ...tc, output: event.output, status: "done" as const }
                    : tc
                ),
              }
            : m
        );
      });
    }

    if (event.type === "done") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeMessageIdRef.current ? { ...m, streaming: false } : m
        )
      );
      activeMessageIdRef.current = null;
      if (event.cart) {
        setCart(event.cart);
        if (event.cart.items?.length) setActiveTab("chat");
      }
    }

    if (event.type === "error") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeMessageIdRef.current
            ? {
                ...m,
                streaming: false,
                content:
                  m.content ||
                  `⚠️ Something went wrong: ${event.message ?? "unknown error"}. Please try again.`,
              }
            : m
        )
      );
      activeMessageIdRef.current = null;
      // Recover cart silently
      if (sessionId) {
        chrome.runtime.sendMessage({ type: "GET_CART", session_id: sessionId }, (r) => {
          if (r?.cart) setCart(r.cart);
        });
      }
    }
  }, [sessionId]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId || !text.trim()) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };
      const assistantMsgId = `a-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        toolCalls: [],
        streaming: true,
      };

      activeMessageIdRef.current = assistantMsgId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      armWatchdog(); // covers the case where no SSE event ever arrives

      chrome.runtime.sendMessage({
        type: "CHAT_STREAM",
        session_id: sessionId,
        message: text.trim(),
      });
    },
    [sessionId, armWatchdog]
  );

  // ── Place order ───────────────────────────────────────────────────────────
  const placeOrder = useCallback(() => {
    if (!sessionId) return;
    chrome.runtime.sendMessage({ type: "PLACE_ORDER", session_id: sessionId }, (res) => {
      if (res?.order) {
        setCart(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            role: "assistant",
            content: `✅ Order placed! Reference: **${res.order.order_id}** · €${res.order.total_eur}`,
          },
        ]);
        setActiveTab("chat");
      }
    });
  }, [sessionId]);

  // ── Inject cart into retailer ─────────────────────────────────────────────
  const injectToStore = useCallback(
    (store: string) => {
      if (!cart?.items?.length) return;
      setInjectionStatus({ phase: "injecting", current: "Opening store…", done: 0, total: cart.items.length });
      chrome.runtime.sendMessage({
        type: "INJECT_CART",
        items: cart.items,
        store,
      });
    },
    [cart]
  );

  const cartCount = cart?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="flex flex-col h-[580px] w-[400px] bg-white font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-700 text-white shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <span className="font-bold text-base tracking-tight">Baile</span>
          <span className="text-xs text-emerald-200 hidden sm:inline">Grocery Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <TabBtn active={activeTab === "chat"} onClick={() => setActiveTab("chat")}>
            Chat
          </TabBtn>
          <TabBtn active={activeTab === "cart"} onClick={() => setActiveTab("cart")}>
            Cart
            {cartCount > 0 && (
              <span className="ml-1 bg-white text-emerald-700 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {cartCount}
              </span>
            )}
          </TabBtn>
        </div>
      </div>

      {/* Wake-up banner */}
      {serverStatus !== "ready" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {serverStatus === "checking"
            ? "Connecting to Baile…"
            : "Waking up server — first load takes ~30s on free tier…"}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" ? (
          <ChatView
            messages={messages}
            onSend={sendMessage}
            sessionReady={!!sessionId}
          />
        ) : (
          <CartView
            cart={cart}
            injectionStatus={injectionStatus}
            onPlaceOrder={placeOrder}
            onInjectToStore={injectToStore}
            onResetInjection={() => setInjectionStatus({ phase: "idle" })}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
        active
          ? "bg-white text-emerald-700"
          : "text-emerald-100 hover:bg-emerald-600"
      }`}
    >
      {children}
    </button>
  );
}
