import type { Cart, CartItem, InjectionStatus } from "../types";

const STORE_META: Record<string, { name: string; color: string; bg: string; border: string; store_id: string }> = {
  tesco: {
    name: "Tesco Phibsborough",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    store_id: "tesco",
  },
  patels_asian_grocery: {
    name: "Patel's Asian Grocery",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    store_id: "patels_asian_grocery",
  },
  global_foods: {
    name: "Global Foods Smithfield",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    store_id: "global_foods",
  },
};

export default function CartView({
  cart,
  injectionStatus,
  onPlaceOrder,
  onInjectToStore,
  onResetInjection,
}: {
  cart: Cart | null;
  injectionStatus: InjectionStatus;
  onPlaceOrder: () => void;
  onInjectToStore: (store: string) => void;
  onResetInjection: () => void;
}) {
  if (!cart?.items?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="text-4xl">🛍️</div>
        <p className="text-sm text-gray-500">
          Your cart is empty. Chat with Baile to find and add products.
        </p>
      </div>
    );
  }

  // Group by store
  const byStore = cart.items.reduce<Record<string, CartItem[]>>((acc, item) => {
    const key = item.store_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Injection in progress
  if (injectionStatus.phase === "injecting") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="text-3xl animate-bounce">🛒</div>
        <p className="text-sm font-medium text-gray-700">Adding items to your cart…</p>
        <p className="text-xs text-gray-500">{injectionStatus.current}</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(injectionStatus.done / injectionStatus.total) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          {injectionStatus.done} / {injectionStatus.total} items
        </p>
      </div>
    );
  }

  if (injectionStatus.phase === "complete") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="text-4xl">✅</div>
        <p className="text-sm font-semibold text-gray-800">
          {injectionStatus.itemsAdded} items added to your cart!
        </p>
        <p className="text-xs text-gray-500">Opening checkout…</p>
        <button
          onClick={onResetInjection}
          className="text-xs text-emerald-600 underline hover:text-emerald-800"
        >
          Back to cart
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {Object.entries(byStore).map(([storeId, items]) => {
          const meta = STORE_META[storeId] ?? {
            name: storeId,
            color: "text-gray-700",
            bg: "bg-gray-50",
            border: "border-gray-200",
            store_id: storeId,
          };
          const storeTotal = items.reduce(
            (s, i) => s + Number(i.price_eur) * i.quantity,
            0
          );

          return (
            <div key={storeId} className={`rounded-xl border ${meta.border} overflow-hidden`}>
              {/* Store header */}
              <div className={`flex items-center justify-between px-3 py-2 ${meta.bg}`}>
                <span className={`text-xs font-semibold ${meta.color}`}>{meta.name}</span>
                <span className={`text-xs font-bold ${meta.color}`}>€{storeTotal.toFixed(2)}</span>
              </div>

              {/* Items */}
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{item.product_name}</p>
                      <p className="text-[10px] text-gray-400">
                        €{Number(item.price_eur).toFixed(2)} × {item.quantity}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 ml-2">
                      €{(Number(item.price_eur) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Inject button */}
              <div className={`px-3 py-2 ${meta.bg} border-t ${meta.border}`}>
                <button
                  onClick={() => onInjectToStore(storeId)}
                  className={`w-full text-xs font-medium py-1.5 rounded-lg border ${meta.border} ${meta.color} hover:opacity-80 transition-opacity`}
                >
                  Add to {meta.name.split(" ")[0]} cart →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Total</span>
          <span className="text-sm font-bold text-gray-900">€{cart.total_eur.toFixed(2)}</span>
        </div>
        <button
          onClick={onPlaceOrder}
          className="w-full bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Place Order (mock checkout)
        </button>
      </div>
    </div>
  );
}
