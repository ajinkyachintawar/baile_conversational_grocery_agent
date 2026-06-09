const API = "https://baile-conversational-grocery-agent.onrender.com";

// ── Session management ─────────────────────────────────────────────────────

async function getOrCreateSession(): Promise<string> {
  const stored = await chrome.storage.local.get("session_id");
  if (stored.session_id) return stored.session_id as string;

  const res = await fetch(`${API}/sessions`, { method: "POST" });
  const data = await res.json();
  await chrome.storage.local.set({ session_id: data.session_id });
  return data.session_id as string;
}

// ── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SESSION") {
    getOrCreateSession().then((id) => sendResponse({ session_id: id }));
    return true; // keep channel open for async response
  }

  if (msg.type === "CHAT_STREAM") {
    handleChatStream(msg.session_id, msg.message);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_CART") {
    fetch(`${API}/cart/${msg.session_id}`)
      .then((r) => r.json())
      .then((cart) => sendResponse({ cart }))
      .catch(() => sendResponse({ cart: null }));
    return true;
  }

  if (msg.type === "PLACE_ORDER") {
    fetch(`${API}/orders/${msg.session_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((order) => sendResponse({ order }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (msg.type === "INJECT_CART") {
    injectCart(msg.items, msg.store);
    sendResponse({ ok: true });
    return false;
  }
});

// ── SSE chat stream ────────────────────────────────────────────────────────

async function handleChatStream(sessionId: string, message: string) {
  try {
    const res = await fetch(`${API}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
    });

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          // Broadcast to all popup tabs
          chrome.runtime.sendMessage({ type: "SSE_EVENT", event }).catch(() => {});
        } catch {
          // ignore malformed JSON
        }
      }
    }
  } catch (e) {
    chrome.runtime.sendMessage({
      type: "SSE_EVENT",
      event: { type: "error", message: String(e) },
    }).catch(() => {});
  }
}

// ── Cart injection coordinator ─────────────────────────────────────────────

async function injectCart(
  items: Array<{ product_name: string; store_id: string; quantity: number }>,
  store: string
) {
  const storeItems = items.filter((i) => i.store_id === store);
  if (!storeItems.length) return;

  const url =
    store === "tesco"
      ? "https://www.tesco.ie/groceries/en-GB/shop/fresh-food/all"
      : "https://www.dunnesstoresgrocery.com/sm/planning/rsid/2001";

  // Open a tab for the target store
  const tab = await chrome.tabs.create({ url, active: true });
  const tabId = tab.id!;

  // Wait for page to load
  await waitForTabLoad(tabId);

  // Send items to content script
  chrome.tabs.sendMessage(tabId, {
    type: "INJECT_ITEMS",
    items: storeItems,
    store,
  });
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      id: number,
      _info: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (id === tabId && tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
