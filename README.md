# Baile 🛒
### Conversational grocery agent for Irish independent stores

> *Baile* (Irish: "home") — find products, compare prices, build a split cart, and get to checkout — all in a single chat conversation.

![Baile UI](https://img.shields.io/badge/status-portfolio--demo-blue)
![Stack](https://img.shields.io/badge/stack-LangGraph%20%7C%20FastAPI%20%7C%20React-informational)
![DB](https://img.shields.io/badge/db-Supabase%20pgvector-green)

---

## What is Baile?

Most price comparison tools show you a list. **Baile builds the cart.**

You describe what you want to cook or buy in plain English. Baile:
1. Semantically searches products across 3 Dublin stores
2. Compares prices and identifies the cheapest basket
3. Proposes a split cart across stores when it saves you money
4. Handles substitutions mid-conversation ("actually, dairy-free milk")
5. Remembers your last order ("same as last time")

### vs supermarket.ie
| Feature | supermarket.ie | Baile |
|---|---|---|
| Price comparison | ✅ | ✅ |
| Weekly meal planning | ✅ | ❌ (out of scope) |
| Cart building | ❌ | ✅ |
| Checkout handoff | ❌ | ✅ (mock) |
| Independent/ethnic stores | ❌ | ✅ |
| Split cart optimisation | ❌ | ✅ |
| Glass-box agent reasoning | ❌ | ✅ |
| Substitution handling | ❌ | ✅ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React + TypeScript + Tailwind CSS (Vite)                   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │ ChatPanel            │  │ CartPanel + CompareTable     │   │
│  │ · Streaming bubbles  │  │ · Live receipt               │   │
│  │ · ToolCallBadge      │  │ · Price matrix               │   │
│  │   (glass-box SSE)    │  │ · Place order                │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ SSE  (tool_start / tool_end / text / done)
┌────────────────────────▼────────────────────────────────────┐
│  FastAPI  (Python)                                          │
│  POST /chat/stream  ·  GET /cart  ·  POST /orders          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  LangGraph  StateGraph                                      │
│                                                             │
│   agent ──► tools ──► agent ──► …                          │
│      │                                                      │
│   Groq llama-3.3-70b-versatile  (fallback: 3.1-8b-instant) │
└──────┬──────────────────────┬───────────────────────────────┘
       │ 6 tools              │ embeddings
┌──────▼──────┐    ┌──────────▼─────────────────────────────┐
│  Supabase   │    │  NVIDIA NIM                             │
│  Postgres   │    │  nvidia/nv-embedqa-e5-v5  (1024 dims)   │
│  + pgvector │    └────────────────────────────────────────┘
│  132 products│
│  3 stores   │
└─────────────┘
```

### The 6 LangGraph tools

| Tool | Purpose |
|---|---|
| `search_products` | Semantic vector search across stores via pgvector |
| `compare_stores` | Price matrix — basket × store, cheapest highlighted |
| `manage_cart` | Add / remove / update / clear / rebuild from order |
| `suggest_substitution` | Find alternatives given a constraint (dietary, budget) |
| `optimise_split` | Greedy algorithm — assign each item to cheapest store |
| `get_order_history` | Recall previous orders for "same as last time" |

### Glass-box UI
Every tool call appears as an expandable badge in the chat — showing the raw input and output JSON. This is the key differentiator: you can see exactly why Baile made each decision.

---

## Data sources

| Store | Type | Products |
|---|---|---|
| Tesco Phibsborough | Chain | 46 items |
| Patel's Asian Grocery | Independent | 41 items |
| Global Foods Smithfield | Independent (halal) | 45 items |

**132 products** seeded from realistic Irish grocery pricing (point-in-time, June 2025). South Asian staples (MDH spices, TRS basmati, Patak's sauces) are priced 5–15% cheaper at the independents. Halal chicken is exclusively at Global Foods — this drives the split cart use case.

Embeddings generated with `nvidia/nv-embedqa-e5-v5` (1024 dims) via NVIDIA NIM.

---

## The 5 demo use cases

### 1. Dal tadka ingredients, budget €10
```
You: Find ingredients for dal tadka, budget €10
```
→ `search_products` finds relevant items → `compare_stores` builds price matrix → `optimise_split` assigns each item to cheapest store → cart built automatically.

### 2. Full Irish breakfast comparison
```
You: Compare a full Irish breakfast across stores
```
→ `compare_stores` fires → price table renders in the right panel with Tesco vs Patel's vs Global Foods, cheapest basket highlighted in green.

### 3. Split cart optimisation
```
You: I need basmati rice, ghee and halal chicken — cheapest split
```
→ `optimise_split` assigns rice + ghee to Global Foods (cheapest), halal chicken exclusively to Global Foods → shows savings vs single-store.

### 4. Same as last time
```
You: Same as last time
```
→ `get_order_history` retrieves last order → cart rebuilt → agent flags any price changes since last visit.

### 5. Specific product availability
```
You: Do you have MDH chana masala?
```
→ `search_products` → "Available at Patel's (€1.79) and Global Foods (€1.69). Add to cart?"

---

## How to run locally

### Prerequisites
- Python 3.12+
- Node 20+
- A [Supabase](https://supabase.com) project (free tier)
- [Groq](https://console.groq.com) API key (free tier)
- [NVIDIA NIM](https://build.nvidia.com) API key (for embeddings)

### 1. Clone and configure
```bash
git clone https://github.com/ajinkyachintawar/baile_conversational_grocery_agent.git
cd baile_conversational_grocery_agent

cp backend/.env.example backend/.env
# Fill in: GROQ_API_KEY, NIM_API_KEY_EMBED, SUPABASE_URL, SUPABASE_SERVICE_KEY
```

### 2. Set up the database
Run `backend/db/schema.sql` in your Supabase SQL editor. This creates all tables, indexes, the `match_products()` RPC, and seeds the 3 stores.

### 3. Seed products
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python data/embed_and_upsert.py
# Embeds 132 products via NIM and upserts to Supabase (~2 min)
```

### 4. Start the backend
```bash
cd backend
uvicorn backend.main:app --reload --port 8000
```

### 5. Start the frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Or with Docker
```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

---

## Project structure

```
baile/
├── backend/
│   ├── main.py                  # FastAPI app, SSE endpoint
│   ├── agent/
│   │   ├── graph.py             # LangGraph StateGraph + Groq LLM
│   │   ├── state.py             # AgentState TypedDict
│   │   └── tools/
│   │       ├── search_products.py
│   │       ├── compare_stores.py
│   │       ├── manage_cart.py
│   │       ├── suggest_substitution.py
│   │       ├── optimise_split.py
│   │       └── get_order_history.py
│   ├── db/
│   │   ├── supabase_client.py
│   │   └── schema.sql
│   └── data/
│       ├── seed/products.json   # 132 Irish grocery products
│       └── embed_and_upsert.py  # One-time seeding script
├── frontend/
│   └── src/
│       ├── App.tsx              # Split-panel layout
│       ├── components/
│       │   ├── ChatPanel.tsx    # WhatsApp-style streaming chat
│       │   ├── CartPanel.tsx    # Live receipt, grouped by store
│       │   ├── CompareTable.tsx # Price grid (appears on compare tool)
│       │   ├── ToolCallBadge.tsx # Glass-box SSE tool display
│       │   └── MessageBubble.tsx
│       └── hooks/
│           └── useSSE.ts        # SSE stream hook
└── docker-compose.yml
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Agent orchestration | LangGraph 0.2 (Python) |
| API + streaming | FastAPI + Server-Sent Events |
| Vector DB | Supabase pgvector (1024-dim IVFFlat index) |
| LLM | Groq llama-3.3-70b-versatile (fallback: 3.1-8b-instant) |
| Embeddings | NVIDIA NIM `nv-embedqa-e5-v5` |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 5 |
| Containerisation | Docker Compose |

---

## What's not built (intentionally)

- **No user authentication** — sessions are anonymous UUIDs stored in localStorage
- **No real payments** — checkout is mocked (saves to `orders` table)
- **No live price updates** — point-in-time seed data is honest and sufficient for a demo
- **No meal planning** — that's supermarket.ie's lane

## V2 ideas

- Chrome extension that pushes the confirmed Baile cart to tesco.ie (user lands on real checkout with items pre-added)
- Live price scraping via Apify
- WhatsApp interface via Twilio
- Retailer onboarding portal for independent stores

---

*Built by [Ajinkya Chintawar](https://github.com/ajinkyachintawar) · June 2025*
