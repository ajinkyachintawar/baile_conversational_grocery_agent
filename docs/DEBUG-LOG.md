# Debug Log — "7 minutes, no output" incident

**Date:** 2026-06-11
**Symptom reported:** Chrome extension shows no response at all after 7 minutes of waiting. Earlier symptoms in the same series: tool-call loops (10+ repeated `search_products`), a 3–4 minute response that added one item without a price.

---

## 1. Diagnosis methodology

Rule: **no code changes until the failure is reproduced with proof, outside the extension.** Each layer of the chain was tested directly with `curl` against the production Render deployment.

### Test 1 — Is the server cold/slow?

```
curl -w "%{time_total}" https://baile-conversational-grocery-agent.onrender.com/health
→ HTTP 200 | total time: 0.250s
```

**Verdict:** server warm and fast. Cold start ruled out (keep-alive cron is working).

### Test 2 — Cart request, raw SSE stream with timestamps

```
19:36:02  POST /chat/stream  "add 2 milk and a bag of basmati rice to my cart"
19:36:04  data: {"type": "error", "message": "Object of type HumanMessage is not JSON serializable"}
```

**Verdict:** the request dies in **2 seconds**, not 7 minutes. The extension never showed this error.

### Test 3 — Search-only request (no cart tools)

```
19:36:31  POST /chat/stream  "what milk do you have and how much is it?"
19:36:32  data: {"type": "error", "message": "tool call validation failed: parameters for
          tool search_products did not match schema: errors: [`/limit`: expected integer …"}
```

**Verdict:** a second, independent crash — dead in **1 second**.

### Conclusion

The system was never slow. Every request crashed within 1–2 seconds and the
extension swallowed the error silently, so the user stared at an empty,
forever-"streaming" bubble. The perceived 7-minute hang was the absence of any
error UI, not actual latency.

---

## 2. Root causes (three distinct bugs)

### Bug A — SSE generator crash on `InjectedState` tools

`manage_cart` and `get_order_history` declare
`state: Annotated[dict, InjectedState()]`. LangGraph injects the **entire
graph state** — including raw `HumanMessage` objects — into the tool's input.
The `on_tool_start` handler in `backend/main.py` did
`json.dumps(event["data"].get("input"))` on that input. `HumanMessage` is not
JSON-serializable → exception → the whole SSE generator dies → stream ends
with a single error event.

This is why "added only one item without price": the stream died midway
through the first cart mutation on earlier attempts.

### Bug B — Groq tool-call validation 400 treated as fatal

Llama models occasionally emit numeric tool parameters as strings
(`limit: "5"`). Groq validates tool calls against the JSON schema **server-side**
and rejects with a 400 `tool_use_failed` error. Our retry logic in
`backend/agent/graph.py` only caught 429 rate limits; the 400 re-raised and
killed the stream. These failures are stochastic — a retry usually succeeds —
but we never retried.

This also explains the earlier "loop" symptom: the model repeatedly attempting
tool calls that kept being rejected.

### Bug C — Extension swallows errors and has no timeout

`Popup.tsx`'s `error` event handler set `streaming: false` and displayed
**nothing**. There was no client-side timeout either. Any backend failure =
infinite silent spinner. Additionally, `service-worker.ts` ignored non-OK HTTP
responses, and MV3 service workers can be terminated by Chrome after ~30s of
perceived inactivity — which would also drop a stream silently.

---

## 3. Fixes applied

| # | File | Change |
|---|------|--------|
| 1 | `backend/main.py` | `_safe_payload()` — all SSE `json.dumps` now use `default=str` (can never raise). `_clean_tool_input()` strips the injected `state`/`messages` blob before serializing `tool_start`. `SSE_TIMEOUT` lowered 300s → 120s. |
| 2 | `backend/agent/graph.py` | `call_model` retry ladder: primary → primary retry → fallback model. Rate-limit errors skip straight to fallback; `tool_use_failed` 400s retry; if everything fails, return a graceful AIMessage instead of crashing the stream. |
| 3 | `backend/agent/tools/search_products.py` | `limit: int \| str` — schema now accepts the strings Llama emits (already coerced internally). |
| 4 | `backend/agent/tools/manage_cart.py` | `quantity: int \| str`, `price_eur: float \| str \| None` + coercion; unparseable price falls through to the products-table auto-fill. |
| 5 | `extension/src/popup/Popup.tsx` | Error events now render visibly ("⚠️ Something went wrong: …"). 60-second watchdog: if no SSE event arrives while streaming, the bubble resolves to a timeout message. Watchdog re-arms on every event, disarms on `done`/`error`. |
| 6 | `extension/src/background/service-worker.ts` | Non-OK HTTP responses and empty bodies now emit error events. `chrome.runtime.getPlatformInfo()` keepalive every 20s during streaming prevents MV3 worker termination mid-stream. |

**Design principle after this incident: the stream must always end in a
user-visible state.** Either `done`, a visible error, or a client timeout —
silence is no longer a reachable state.

---

## 4. Verification

`scripts/e2e_test.sh` runs the full journey against production:

1. `/health` responds 200
2. `POST /sessions` returns a session id
3. Search chat streams text and ends with `done` and no `error`
4. Cart chat calls `manage_cart` and ends with `done`
5. `GET /cart/{id}` shows items **with prices**
6. `POST /orders/{id}` places the order

Results recorded in section 5 below after each deploy.

---

## 5. Deploy + test record

(filled in as runs complete)
