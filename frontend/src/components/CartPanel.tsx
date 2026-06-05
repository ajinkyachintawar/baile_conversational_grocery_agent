import { useState } from 'react'
import type { Cart, StoreGroup } from '../types'
import { placeOrder } from '../hooks/useSSE'

const STORE_NAMES: Record<string, string> = {
  tesco_phibsboro: 'Tesco Phibsborough',
  patel_grocery: "Patel's Asian Grocery",
  global_foods: 'Global Foods Smithfield',
}

const STORE_COLORS: Record<string, string> = {
  tesco_phibsboro: 'bg-blue-50 border-blue-200',
  patel_grocery: 'bg-orange-50 border-orange-200',
  global_foods: 'bg-green-50 border-green-200',
}

const STORE_DOT: Record<string, string> = {
  tesco_phibsboro: 'bg-blue-500',
  patel_grocery: 'bg-orange-500',
  global_foods: 'bg-green-500',
}

interface Props {
  cart: Cart
  sessionId: string
  onOrderPlaced: () => void
}

function groupByStore(cart: Cart): StoreGroup[] {
  const map: Record<string, StoreGroup> = {}
  for (const item of cart.items) {
    const sid = item.store_id ?? 'unknown'
    if (!map[sid]) map[sid] = { store_id: sid, items: [], subtotal: 0 }
    map[sid].items.push(item)
    if (item.price_eur && item.quantity) {
      map[sid].subtotal += item.price_eur * item.quantity
    }
  }
  return Object.values(map)
}

export function CartPanel({ cart, sessionId, onOrderPlaced }: Props) {
  const [placing, setPlacing] = useState(false)
  const [ordered, setOrdered] = useState<{ order_id: string; total_eur: number } | null>(null)

  const groups = groupByStore(cart)
  const isEmpty = cart.items.length === 0

  const handleCheckout = async () => {
    setPlacing(true)
    try {
      const result = await placeOrder(sessionId)
      setOrdered(result)
      onOrderPlaced()
    } catch {
      alert('Checkout failed — please try again.')
    } finally {
      setPlacing(false)
    }
  }

  if (ordered) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
        <div>
          <p className="font-semibold text-gray-800">Order placed!</p>
          <p className="text-sm text-gray-500 mt-1">Total: <span className="font-medium text-gray-700">€{ordered.total_eur.toFixed(2)}</span></p>
          <p className="text-xs text-gray-400 mt-1 font-mono">{ordered.order_id.slice(0, 8)}…</p>
        </div>
        <button
          onClick={() => { setOrdered(null) }}
          className="text-sm text-blue-500 hover:underline"
        >
          Start a new order
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛒</span>
          <span className="text-sm font-semibold text-gray-800">Your Cart</span>
        </div>
        {!isEmpty && (
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            {cart.items.length} item{cart.items.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Cart body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-4xl opacity-20">🛍️</div>
            <p className="text-sm text-gray-400">Your cart is empty</p>
            <p className="text-xs text-gray-300">Ask Baile to find products and add them here</p>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.store_id}
              className={`rounded-xl border p-3 ${STORE_COLORS[group.store_id] ?? 'bg-gray-50 border-gray-200'}`}
            >
              {/* Store header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${STORE_DOT[group.store_id] ?? 'bg-gray-400'}`} />
                <span className="text-xs font-semibold text-gray-600">
                  {STORE_NAMES[group.store_id] ?? group.store_id}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 font-medium truncate">{item.product_name}</p>
                      {item.unit && <p className="text-[10px] text-gray-400">{item.unit}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-700 font-medium">
                        {item.price_eur != null ? `€${(item.price_eur * item.quantity).toFixed(2)}` : '—'}
                      </p>
                      <p className="text-[10px] text-gray-400">×{item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Store subtotal */}
              <div className="mt-2 pt-2 border-t border-black/10 flex justify-between">
                <span className="text-[11px] text-gray-500">Subtotal</span>
                <span className="text-[11px] font-semibold text-gray-700">€{group.subtotal.toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!isEmpty && (
        <div className="px-4 py-4 border-t border-gray-100 bg-white shrink-0 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-lg font-bold text-gray-900">€{cart.total_eur.toFixed(2)}</span>
          </div>
          <button
            onClick={handleCheckout}
            disabled={placing}
            className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {placing
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Placing…</>
              : '🧾 Place order'
            }
          </button>
          {groups.length > 1 && (
            <p className="text-[10px] text-center text-gray-400">
              Split across {groups.length} stores · items assigned to cheapest available store
            </p>
          )}
        </div>
      )}
    </div>
  )
}
