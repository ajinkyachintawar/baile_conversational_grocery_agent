import { useEffect, useRef, useState, useCallback } from 'react'
import type { Message, Cart, CompareData } from '../types'
import { MessageBubble } from './MessageBubble'
import { useSSE } from '../hooks/useSSE'

interface Props {
  sessionId: string
  onCartUpdate: (cart: Cart) => void
  onCompareData: (data: CompareData | null) => void
}

const SUGGESTIONS = [
  'Find ingredients for dal tadka, budget €10',
  'Compare a full Irish breakfast across stores',
  'Do you have MDH chana masala?',
  'I need basmati rice, ghee and halal chicken — cheapest split',
]

function newId() {
  return Math.random().toString(36).slice(2)
}

export function ChatPanel({ sessionId, onCartUpdate, onCompareData }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Dia duit! I\'m Baile 🛒 — your Irish grocery agent. Tell me what you want to cook or buy and I\'ll find the best prices across Tesco Phibsborough, Patel\'s Asian Grocery, and Global Foods Smithfield.',
      toolCalls: [],
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeMessageId = useRef<string | null>(null)
  const activeToolId = useRef<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onToolStart = useCallback((tool: string, input: unknown) => {
    const toolId = newId()
    activeToolId.current = toolId

    setMessages((prev) => {
      const msgId = activeMessageId.current
      if (!msgId) return prev
      return prev.map((m) =>
        m.id === msgId
          ? { ...m, toolCalls: [...m.toolCalls, { id: toolId, tool, input, status: 'running', timestamp: Date.now() }] }
          : m,
      )
    })
  }, [])

  const onToolEnd = useCallback((tool: string, output: string) => {
    const toolId = activeToolId.current

    // Extract compare data if it's a compare_stores result
    if (tool === 'compare_stores') {
      try {
        const parsed = JSON.parse(output)
        if (parsed.matrix) onCompareData(parsed as CompareData)
      } catch { /* ignore */ }
    }

    setMessages((prev) => {
      const msgId = activeMessageId.current
      if (!msgId || !toolId) return prev
      return prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === toolId ? { ...tc, output, status: 'done' } : tc,
              ),
            }
          : m,
      )
    })
  }, [onCompareData])

  const onText = useCallback((chunk: string) => {
    setMessages((prev) => {
      const msgId = activeMessageId.current
      if (!msgId) return prev
      return prev.map((m) =>
        m.id === msgId ? { ...m, content: m.content + chunk, streaming: true } : m,
      )
    })
  }, [])

  const onDone = useCallback((cart: Cart) => {
    setIsLoading(false)
    activeMessageId.current = null
    activeToolId.current = null
    onCartUpdate(cart)
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    )
  }, [onCartUpdate])

  const onError = useCallback((msg: string) => {
    setIsLoading(false)
    activeMessageId.current = null
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: 'assistant', content: `Sorry, something went wrong: ${msg}`, toolCalls: [], timestamp: Date.now() },
    ])
  }, [])

  const { send } = useSSE({ onToolStart, onToolEnd, onText, onDone, onError })

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setInput('')
    onCompareData(null) // reset compare table on new message

    // Add user message
    const userMsg: Message = { id: newId(), role: 'user', content: trimmed, toolCalls: [], timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])

    // Add empty assistant message as streaming target
    const asstId = newId()
    activeMessageId.current = asstId
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '', toolCalls: [], timestamp: Date.now(), streaming: true }
    setMessages((prev) => [...prev, asstMsg])
    setIsLoading(true)

    await send(trimmed, sessionId)
  }, [isLoading, sessionId, send, onCompareData])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">B</div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Baile</p>
          <p className="text-[11px] text-gray-400">Irish Grocery Agent · 3 stores</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips — only show when no real messages yet */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2 bg-gray-50">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        <div className="flex items-end gap-2 bg-gray-100 rounded-2xl px-4 py-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none max-h-28 min-h-[20px]"
            style={{ lineHeight: '1.4' }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isLoading}
            className={`
              mb-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all
              ${input.trim() && !isLoading ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-300 text-gray-400 cursor-not-allowed'}
            `}
          >
            {isLoading
              ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" /></svg>
            }
          </button>
        </div>
        <p className="text-[10px] text-gray-300 text-center mt-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
