export interface CartItem {
  id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  store_id: string;
  store_name?: string;
  price_eur: number;
  quantity: number;
  added_at: string;
}

export interface Cart {
  session_id: string;
  items: CartItem[];
  total_eur: number;
}

export interface SSEEvent {
  type: "tool_start" | "tool_end" | "text" | "done" | "error";
  content?: string;
  tool?: string;
  input?: unknown;
  output?: string;
  cart?: Cart;
  message?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

export interface ToolCall {
  id: string;
  tool: string;
  input?: unknown;
  output?: string;
  status: "running" | "done";
}

export type InjectionStatus =
  | { phase: "idle" }
  | { phase: "injecting"; current: string; done: number; total: number }
  | { phase: "complete"; itemsAdded: number }
  | { phase: "error"; message: string };
