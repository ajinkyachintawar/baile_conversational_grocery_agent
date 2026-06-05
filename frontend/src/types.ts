export type Role = 'user' | 'assistant'

export interface ToolCall {
  id: string
  tool: string
  input: unknown
  output?: string
  status: 'running' | 'done'
  timestamp: number
}

export interface Message {
  id: string
  role: Role
  content: string
  toolCalls: ToolCall[]
  timestamp: number
  streaming?: boolean
}

export interface CartItem {
  id: string
  session_id: string
  store_id: string
  product_id: string | null
  product_name: string
  price_eur: number | null
  quantity: number
  unit: string | null
  added_at: string
}

export interface Cart {
  items: CartItem[]
  total_eur: number
}

export interface StoreGroup {
  store_id: string
  items: CartItem[]
  subtotal: number
}

export interface CompareCell {
  available: boolean
  price_eur?: number | null
  matched_name?: string
  unit?: string
}

export interface CompareMatrix {
  [productName: string]: {
    stores: { [storeId: string]: CompareCell }
  }
}

export interface CompareData {
  matrix: CompareMatrix
  store_names: { [storeId: string]: string }
  basket_totals: { [storeName: string]: number | null }
  cheapest_store: string | null
  items_compared: string[]
}

export type SSEEvent =
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: string }
  | { type: 'text'; content: string }
  | { type: 'done'; cart: Cart }
  | { type: 'error'; message: string }
