import { useCallback, useRef } from 'react'
import type { SSEEvent, Cart } from '../types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface UseSSECallbacks {
  onToolStart: (tool: string, input: unknown) => void
  onToolEnd: (tool: string, output: string) => void
  onText: (chunk: string) => void
  onDone: (cart: Cart) => void
  onError: (msg: string) => void
}

export function useSSE(callbacks: UseSSECallbacks) {
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (message: string, sessionId: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const res = await fetch(`${API}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, session_id: sessionId }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          callbacks.onError(`HTTP ${res.status}`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            try {
              const evt = JSON.parse(raw) as SSEEvent
              if (evt.type === 'tool_start') callbacks.onToolStart(evt.tool, evt.input)
              else if (evt.type === 'tool_end') callbacks.onToolEnd(evt.tool, evt.output)
              else if (evt.type === 'text') callbacks.onText(evt.content)
              else if (evt.type === 'done') callbacks.onDone(evt.cart)
              else if (evt.type === 'error') callbacks.onError(evt.message)
            } catch {
              /* skip malformed line */
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          callbacks.onError(err.message)
        }
      }
    },
    [callbacks],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { send, abort }
}

export async function createSession(): Promise<string> {
  const res = await fetch(`${API}/sessions`, { method: 'POST' })
  const data = await res.json()
  return data.session_id as string
}

export async function fetchCart(sessionId: string): Promise<Cart> {
  try {
    const res = await fetch(`${API}/cart/${sessionId}`)
    return res.json()
  } catch {
    return { items: [], total_eur: 0 }
  }
}

export async function placeOrder(sessionId: string): Promise<{ order_id: string; total_eur: number }> {
  const res = await fetch(`${API}/orders/${sessionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
  return res.json()
}
