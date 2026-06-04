-- Enable pgvector extension (run once per Supabase project)
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores reference table
CREATE TABLE IF NOT EXISTS stores (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  type        text,             -- 'independent' | 'chain'
  location    text,
  postcode    text,
  closes_at   text
);

-- Products table with pgvector embeddings
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    text NOT NULL REFERENCES stores(id),
  name        text NOT NULL,
  brand       text,
  category    text,
  price_eur   numeric(6,2),
  unit        text,
  in_stock    boolean DEFAULT true,
  barcode     text,
  source      text,
  image_url   text,
  embedding   vector(1024),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- ivfflat max 2000 dims; using nv-embedqa-e5-v5 (1024)

CREATE INDEX IF NOT EXISTS products_store_idx ON products (store_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- User sessions
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Cart items (one row per item per session)
CREATE TABLE IF NOT EXISTS cart_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE,
  store_id     text REFERENCES stores(id),
  product_id   uuid REFERENCES products(id),
  product_name text NOT NULL,
  price_eur    numeric(6,2),
  quantity     integer DEFAULT 1,
  unit         text,
  added_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cart_items_session_idx ON cart_items (session_id);

-- Order history (after mock checkout)
CREATE TABLE IF NOT EXISTS orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES sessions(id),
  store_id    text,
  items       jsonb NOT NULL,
  total_eur   numeric(8,2),
  status      text DEFAULT 'placed',
  placed_at   timestamptz DEFAULT now()
);

-- pgvector similarity search function
-- Returns products ordered by cosine similarity to a query embedding
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1536),
  match_count     int DEFAULT 8,
  filter_store    text DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  store_id     text,
  name         text,
  brand        text,
  category     text,
  price_eur    numeric(6,2),
  unit         text,
  in_stock     boolean,
  image_url    text,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.store_id,
    p.name,
    p.brand,
    p.category,
    p.price_eur,
    p.unit,
    p.in_stock,
    p.image_url,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE
    (filter_store IS NULL OR p.store_id = filter_store)
    AND p.in_stock = true
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Seed the three stores
INSERT INTO stores (id, name, type, location, postcode, closes_at) VALUES
  ('tesco_phibsboro',  'Tesco Phibsborough',      'chain',       'Phibsborough, Dublin 7', 'D07', '22:00'),
  ('patel_grocery',   'Patel''s Asian Grocery',   'independent', 'Phibsborough, Dublin 7', 'D07', '21:00'),
  ('global_foods',    'Global Foods Smithfield',  'independent', 'Smithfield, Dublin 7',   'D07', '20:30')
ON CONFLICT (id) DO NOTHING;
