// Content script — runs on tesco.ie and dunnesstoresgrocery.com
// Receives INJECT_ITEMS from background and adds them to the retailer's cart

interface InjectItem {
  product_name: string;
  store_id: string;
  quantity: number;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "INJECT_ITEMS") {
    const { items, store } = msg as { items: InjectItem[]; store: string };
    runInjection(items, store);
  }
});

async function runInjection(items: InjectItem[], store: string) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    chrome.runtime.sendMessage({
      type: "INJECT_PROGRESS",
      current: item.product_name,
      done: i,
      total: items.length,
    });

    try {
      if (store === "tesco") {
        await addToTesco(item);
      } else if (store === "dunnes") {
        await addToDunnes(item);
      }
    } catch (e) {
      console.warn(`[Baile] Failed to add ${item.product_name}:`, e);
    }

    // Brief pause between items to avoid overwhelming the page
    await sleep(1500);
  }

  chrome.runtime.sendMessage({
    type: "INJECT_PROGRESS",
    current: "",
    done: items.length,
    total: items.length,
    complete: true,
  });
}

// ── Tesco ──────────────────────────────────────────────────────────────────

async function addToTesco(item: InjectItem) {
  const query = encodeURIComponent(item.product_name);
  const searchUrl = `https://www.tesco.ie/groceries/en-GB/search?query=${query}&count=24`;

  // Navigate to search results
  window.location.href = searchUrl;
  await waitForSelector('[data-auto="product-tile--title"]', 5000);

  // Click "Add" on the first result
  const addBtn = document.querySelector<HTMLButtonElement>(
    '[data-auto="product-tile"] button[data-auto="add-button"],' +
    '.product-details--content button.add-to-cart-btn,' +
    'button[aria-label*="Add"]'
  );

  if (addBtn) {
    addBtn.click();
    await sleep(800);

    // If quantity > 1, click the increment button (quantity - 1) more times
    for (let q = 1; q < item.quantity; q++) {
      const incBtn = document.querySelector<HTMLButtonElement>(
        'button[data-auto="increment"],' +
        'button[aria-label*="increase quantity"]'
      );
      if (incBtn) { incBtn.click(); await sleep(400); }
    }
  }
}

// ── Dunnes ─────────────────────────────────────────────────────────────────

async function addToDunnes(item: InjectItem) {
  const query = encodeURIComponent(item.product_name);
  const searchUrl = `https://www.dunnesstoresgrocery.com/sm/planning/rsid/2001/results?q=${query}`;

  window.location.href = searchUrl;
  await waitForSelector('.product-cell', 5000);

  const addBtn = document.querySelector<HTMLButtonElement>(
    '.product-cell .add-to-cart,' +
    '.product-cell button[aria-label*="Add"],' +
    '.dnb-button--add'
  );

  if (addBtn) {
    addBtn.click();
    await sleep(800);

    for (let q = 1; q < item.quantity; q++) {
      const incBtn = document.querySelector<HTMLButtonElement>(
        '.dnb-button--increment,' +
        'button[aria-label*="Increase"]'
      );
      if (incBtn) { incBtn.click(); await sleep(400); }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function waitForSelector(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}
