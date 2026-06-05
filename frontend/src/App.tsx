import { useEffect, useState, useCallback } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { CartPanel } from './components/CartPanel'
import { CompareTable } from './components/CompareTable'
import { createSession } from './hooks/useSSE'
import type { Cart, CompareData } from './types'

const SESSION_KEY = 'baile_session_id'

const EMPTY_CART: Cart = { items: [], total_eur: 0 }

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cart, setCart] = useState<Cart>(EMPTY_CART)
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [cartKey, setCartKey] = useState(0) // force re-mount cart on order placed
  const [drawerOpen, setDrawerOpen] = useState(false) // mobile cart drawer

  useEffect(() => {
    const init = async () => {
      let sid = localStorage.getItem(SESSION_KEY)
      if (!sid) {
        sid = await createSession()
        localStorage.setItem(SESSION_KEY, sid)
      }
      setSessionId(sid)
    }
    init()
  }, [])

  const handleCartUpdate = useCallback((c: Cart) => {
    setCart(c)
    // Auto-open mobile drawer when cart gets items
    if (c.items.length > 0) setDrawerOpen(true)
  }, [])

  const handleOrderPlaced = useCallback(() => {
    setCart(EMPTY_CART)
    setCartKey((k) => k + 1)
  }, [])

  const handleNewChat = useCallback(async () => {
    const sid = await createSession()
    localStorage.setItem(SESSION_KEY, sid)
    setSessionId(sid)
    setCart(EMPTY_CART)
    setCompareData(null)
    setCartKey((k) => k + 1)
    window.location.reload()
  }, [])

  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Starting Baile…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-bold">B</div>
          <div>
            <span className="text-sm font-bold text-gray-900">Baile</span>
            <span className="ml-2 text-xs text-gray-400 hidden sm:inline">Irish Grocery Agent</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile cart toggle */}
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className="lg:hidden relative flex items-center gap-1 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            🛒
            {cart.items.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                {cart.items.length}
              </span>
            )}
          </button>
          <button
            onClick={handleNewChat}
            className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            New chat
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel
            sessionId={sessionId}
            onCartUpdate={handleCartUpdate}
            onCompareData={setCompareData}
          />
        </main>

        {/* Right — Cart + Compare (desktop sidebar) */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-gray-200 bg-white overflow-hidden">
          {/* Compare table sits above cart when visible */}
          {compareData && (
            <div className="border-b border-gray-100 overflow-y-auto max-h-72 shrink-0">
              <CompareTable data={compareData} />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <CartPanel
              key={cartKey}
              cart={cart}
              sessionId={sessionId}
              onOrderPlaced={handleOrderPlaced}
            />
          </div>
        </aside>
      </div>

      {/* Mobile bottom drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="relative bg-white rounded-t-2xl max-h-[75vh] flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-700">Cart & Compare</span>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            {compareData && (
              <div className="border-b border-gray-100 overflow-y-auto shrink-0">
                <CompareTable data={compareData} />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <CartPanel
                key={cartKey}
                cart={cart}
                sessionId={sessionId}
                onOrderPlaced={handleOrderPlaced}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
