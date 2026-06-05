import type { CompareData } from '../types'

interface Props {
  data: CompareData
}

const STORE_IDS = ['tesco_phibsboro', 'patel_grocery', 'global_foods']

export function CompareTable({ data }: Props) {
  const { matrix, store_names, basket_totals, cheapest_store } = data
  const products = Object.keys(matrix)
  const storeNames = STORE_IDS.map((id) => store_names[id] ?? id)

  return (
    <div className="px-4 py-4 shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">⚖️</span>
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Price Comparison</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-semibold text-gray-500 min-w-[100px]">Item</th>
              {storeNames.map((name, i) => (
                <th key={i} className="text-center px-2 py-2 font-semibold text-gray-500 min-w-[90px]">
                  <span className="block text-[10px] leading-tight">{name}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {products.map((productName, rowIdx) => {
              const storeData = matrix[productName]?.stores ?? {}
              // Find cheapest price for this row
              const prices = STORE_IDS
                .map((id) => storeData[id]?.price_eur)
                .filter((p): p is number => p != null)
              const minPrice = prices.length ? Math.min(...prices) : null

              return (
                <tr key={productName} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-medium text-gray-700 max-w-[120px]">
                    <span className="truncate block" title={productName}>{productName}</span>
                  </td>
                  {STORE_IDS.map((storeId) => {
                    const cell = storeData[storeId]
                    const price = cell?.price_eur
                    const available = cell?.available !== false && price != null
                    const isCheapest = available && price === minPrice && prices.length > 1

                    return (
                      <td key={storeId} className="px-2 py-2 text-center">
                        {available ? (
                          <span
                            className={`
                              inline-block px-2 py-0.5 rounded-md font-semibold
                              ${isCheapest
                                ? 'bg-green-100 text-green-700'
                                : 'text-gray-600'
                              }
                            `}
                          >
                            €{price!.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Basket total row */}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-700 text-[11px]">Basket total</td>
              {storeNames.map((name, i) => {
                const total = basket_totals[name]
                const isCheapest = name === cheapest_store

                return (
                  <td key={i} className="px-2 py-2 text-center">
                    {total != null ? (
                      <span className={`
                        inline-block px-2 py-0.5 rounded-md text-[11px] font-bold
                        ${isCheapest ? 'bg-green-500 text-white' : 'text-gray-700'}
                      `}>
                        €{total.toFixed(2)}
                        {isCheapest && <span className="ml-1 text-[9px]">✓ cheapest</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[11px]">incomplete</span>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
