import type { Message } from '../types'
import { ToolCallBadge } from './ToolCallBadge'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Tool call badges appear BEFORE the assistant message */}
      {!isUser && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 w-full max-w-[85%]">
          {message.toolCalls.map((tc) => (
            <ToolCallBadge key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Bubble */}
      {message.content && (
        <div
          className={`
            relative max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm
            ${isUser
              ? 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
            }
          `}
        >
          {message.content}
          {message.streaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-current opacity-70 animate-pulse align-middle rounded-sm" />
          )}
        </div>
      )}

      {/* Timestamp */}
      <span className="text-[10px] text-gray-400 px-1">
        {new Date(message.timestamp).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
