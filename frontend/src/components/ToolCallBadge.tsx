import { useState } from 'react'
import type { ToolCall } from '../types'

const TOOL_ICONS: Record<string, string> = {
  search_products: '🔍',
  compare_stores: '⚖️',
  manage_cart: '🛒',
  suggest_substitution: '🔄',
  optimise_split: '✂️',
  get_order_history: '📋',
}

const TOOL_LABELS: Record<string, string> = {
  search_products: 'search_products',
  compare_stores: 'compare_stores',
  manage_cart: 'manage_cart',
  suggest_substitution: 'suggest_substitution',
  optimise_split: 'optimise_split',
  get_order_history: 'get_order_history',
}

function inputSummary(tool: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const inp = input as Record<string, unknown>

  if (tool === 'search_products') return `"${inp.query ?? ''}"${inp.store_ids ? ` · ${(inp.store_ids as string[]).length} stores` : ''}`
  if (tool === 'compare_stores') return `${(inp.product_names as string[] ?? []).length} items`
  if (tool === 'manage_cart') return `${inp.action}${inp.product_name ? ` · ${inp.product_name}` : ''}`
  if (tool === 'suggest_substitution') return `"${inp.product_name}" → ${inp.constraint}`
  if (tool === 'optimise_split') return `${(inp.basket as unknown[] ?? []).length} items · max ${inp.max_stores ?? 2} stores`
  if (tool === 'get_order_history') return `last ${inp.limit ?? 3} orders`
  return ''
}

interface Props {
  toolCall: ToolCall
}

export function ToolCallBadge({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[toolCall.tool] ?? '⚙️'
  const label = TOOL_LABELS[toolCall.tool] ?? toolCall.tool
  const summary = inputSummary(toolCall.tool, toolCall.input)
  const isRunning = toolCall.status === 'running'

  return (
    <div
      className="group cursor-pointer"
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Collapsed chip */}
      <div className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono
        border transition-all duration-150
        ${isRunning
          ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:border-gray-300'
        }
      `}>
        <span>{icon}</span>
        <span className="font-semibold">{label}</span>
        {summary && <span className="opacity-60">· {summary}</span>}
        {isRunning
          ? <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
          : <span className="ml-1 opacity-40 group-hover:opacity-70 transition-opacity">{expanded ? '▲' : '▼'}</span>
        }
      </div>

      {/* Expanded JSON panel */}
      {expanded && !isRunning && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-gray-900 text-gray-100 text-[11px] font-mono overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-800 text-gray-400 text-[10px] flex gap-3 border-b border-gray-700">
            <span>INPUT</span>
          </div>
          <pre className="px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
          {toolCall.output && (
            <>
              <div className="px-3 py-1.5 bg-gray-800 text-gray-400 text-[10px] flex gap-3 border-y border-gray-700">
                <span>OUTPUT</span>
              </div>
              <pre className="px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48 text-green-300">
                {(() => {
                  try { return JSON.stringify(JSON.parse(toolCall.output), null, 2) }
                  catch { return toolCall.output }
                })()}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
