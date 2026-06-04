"""
One-time seeding script: loads products.json, generates embeddings via NVIDIA NIM
(nv-embedqa-e5-v5, 1024 dims), and upserts to Supabase.

Run from the backend/ directory:
    uv run python data/embed_and_upsert.py
"""

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI  # NIM is OpenAI-compatible
from supabase import create_client

load_dotenv()

NIM_API_KEY = os.environ["NIM_API_KEY_EMBED"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"
BATCH_SIZE = 50  # NIM batch limit
EMBED_DIM = 1024

nim = OpenAI(api_key=NIM_API_KEY, base_url=NIM_BASE_URL)
db = create_client(SUPABASE_URL, SUPABASE_KEY)

SEED_PATH = Path(__file__).parent / "seed" / "products.json"


def embed_batch(texts: list[str]) -> list[list[float]]:
    resp = nim.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
        encoding_format="float",
        extra_body={"input_type": "passage", "truncate": "END"},
    )
    return [item.embedding for item in resp.data]


def main() -> None:
    products = json.loads(SEED_PATH.read_text())
    print(f"Loaded {len(products)} products from seed file.")

    # Build embedding strings
    texts = [
        f"{p['name']} {p.get('brand', '')} {p.get('category', '')}".strip()
        for p in products
    ]

    # Embed in batches
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        print(f"  Embedding batch {i // BATCH_SIZE + 1} ({len(batch)} items)...")
        embeddings = embed_batch(batch)
        all_embeddings.extend(embeddings)
        if i + BATCH_SIZE < len(texts):
            time.sleep(0.5)  # be gentle with the API

    if len(all_embeddings) != len(products):
        print(f"ERROR: got {len(all_embeddings)} embeddings for {len(products)} products", file=sys.stderr)
        sys.exit(1)

    # Validate dimensions
    bad = [i for i, e in enumerate(all_embeddings) if len(e) != EMBED_DIM]
    if bad:
        print(f"ERROR: unexpected embedding dims at indices {bad}", file=sys.stderr)
        sys.exit(1)

    print(f"All {len(all_embeddings)} embeddings generated ({EMBED_DIM} dims each).")

    # Upsert to Supabase in batches
    rows = []
    for product, embedding in zip(products, all_embeddings):
        rows.append({
            "store_id": product["store_id"],
            "name": product["name"],
            "brand": product.get("brand"),
            "category": product.get("category"),
            "price_eur": product["price_eur"],
            "unit": product.get("unit"),
            "in_stock": True,
            "barcode": product.get("barcode"),
            "source": product.get("source"),
            "embedding": embedding,
        })

    upsert_batch_size = 50
    inserted = 0
    for i in range(0, len(rows), upsert_batch_size):
        batch = rows[i : i + upsert_batch_size]
        db.table("products").insert(batch).execute()
        inserted += len(batch)
        print(f"  Upserted {inserted}/{len(rows)} rows...")

    print(f"\nDone. {len(rows)} products seeded into Supabase.")

    # Quick sanity check
    counts = {}
    for row in db.table("products").select("store_id").execute().data:
        counts[row["store_id"]] = counts.get(row["store_id"], 0) + 1
    for store, count in sorted(counts.items()):
        print(f"  {store}: {count} products")


if __name__ == "__main__":
    main()
