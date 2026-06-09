import { useEffect, useRef, useState } from "react";
import type { Message } from "../types";

const SUGGESTIONS = [
  "Dal tadka ingredients, budget €10",
  "Compare a full Irish breakfast across stores",
  "Basmati rice, ghee & halal chicken — cheapest split",
  "Do you have MDH chana masala?",
];

const STORE_COLORS: Record<string, string> = {
  tesco: "bg-blue-100 text-blue-800",
  patels_asian_grocery: "bg-orange-100 text-orange-800",
  global_foods: "bg-green-100 text-green-800",
};

const TOOL_ICONS: Record<string, string> = {
  search_products: "🔍",
  compare_stores: "📊",
  manage_cart: "🛒",
  suggest_substitution: "🔄",
  optimise_split: "⚡",
  get_order_history: "📋",
};

export default function ChatView({
  messages,
  onSend,
  sessionReady,
}: {
  messages: Message[];
  onSend: (text: string) => void;
  sessionReady: boolean;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const t = input.trim();
    if (!t || !sessionReady) return;
    onSend(t);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center pt-4">
            <div className="text-4xl">🛒</div>
            <p className="text-sm text-gray-500 max-w-[280px]">
              Tell me what you want to cook or buy — I'll find the best prices across Dublin stores.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full mt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors border border-emerald-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
                {m.content}
              </div>
            ) : (
              <div className="max-w-[95%] space-y-1.5">
                {/* Tool call badges */}
                {(m.toolCalls ?? []).map((tc) => (
                  <ToolBadge key={tc.id} tc={tc} />
                ))}
                {/* Text bubble */}
                {(m.content || m.streaming) && (
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap">
                    {m.content}
                    {m.streaming && (
                      <span className="inline-flex gap-0.5 ml-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={sessionReady ? "What do you need?" : "Connecting…"}
            disabled={!sessionReady}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 disabled:opacity-50 max-h-24 overflow-y-auto"
          />
          <button
            onClick={submit}
            disabled={!sessionReady || !input.trim()}
            className="bg-emerald-600 text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolBadge({ tc }: { tc: { tool: string; input?: unknown; output?: string; status: string; id?: string } }) {
  const [open, setOpen] = useState(false);
  const icon = TOOL_ICONS[tc.tool] ?? "⚙️";
  const running = tc.status === "running";

  return (
    <div
      className={`rounded-lg border text-xs cursor-pointer transition-all ${
        running
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span>{icon}</span>
        <span className={`font-medium ${running ? "text-amber-700" : "text-gray-600"}`}>
          {tc.tool.replace(/_/g, " ")}
        </span>
        {running ? (
          <span className="ml-auto w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        ) : (
          <span className="ml-auto text-gray-400">{open ? "▲" : "▼"}</span>
        )}
      </div>

      {open && !running && (
        <div className="border-t border-gray-100 bg-gray-950 rounded-b-lg p-2 space-y-1.5">
          {tc.input != null && (
            <div>
              <div className="text-gray-400 text-[10px] mb-0.5 font-mono uppercase tracking-wider">Input</div>
              <pre className="text-green-400 text-[10px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            </div>
          )}
          {tc.output && (
            <div>
              <div className="text-gray-400 text-[10px] mb-0.5 font-mono uppercase tracking-wider">Output</div>
              <pre className="text-blue-300 text-[10px] font-mono whitespace-pre-wrap break-all">
                {(() => {
                  try { return JSON.stringify(JSON.parse(tc.output), null, 2); }
                  catch { return tc.output; }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
