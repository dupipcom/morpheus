'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Send, Bot, User, Loader2 } from "lucide-react"
import { toast } from 'sonner'
import { useI18n } from "@/lib/contexts/i18n"
import { continueConversation } from "./agentActions"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { readStreamableValue } from '@ai-sdk/rsc';
import type { AgentModel } from "./agentActions"
import type { AgentFilterContext } from '@/lib/services/agent';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

interface AgentChatProps {
  initialMessage?: string;
  history?: Message[];
  className?: string;
  filterContext: AgentFilterContext;
}

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export const AgentChat = ({ initialMessage = "", history = [], className = "", filterContext }: AgentChatProps) => {
  const { t, locale } = useI18n()
  const [messages, setMessages] = useState<Message[]>(history)
  const [inputMessage, setInputMessage] = useState(initialMessage)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AgentModel>('deepseek')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)


  // Focus textarea when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Keep input in sync when parent updates suggestion text.
  useEffect(() => {
    setInputMessage(initialMessage)
  }, [initialMessage])

  // The list renders newest-first, so scroll to the top whenever a new
  // exchange is appended.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'start' })
  }, [messages.length])

  // Local-only state: reporting every keystroke to the parent re-renders the
  // whole dashboard per keystroke. The parent can still set the input via the
  // `initialMessage` prop (suggestion buttons).
  const handleInputChange = (value: string) => {
    setInputMessage(value)
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    }

    // Placeholder for the streaming reply; filled in as deltas arrive.
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInputMessage('')
    setIsLoading(true)

    try {
      const { newMessage } = await continueConversation(
        [...messages, userMessage],
        filterContext,
        selectedModel
      );

      let textContent = '';

      for await (const delta of readStreamableValue(newMessage)) {
        textContent = `${textContent}${delta}`;

        // Stream into the assistant slot in place so the list stays in order.
        setMessages(prev =>
          prev.map(message =>
            message.id === assistantMessage.id ? { ...message, content: textContent } : message
          )
        );
      }

      // Finalize the slot with the last text (covers zero-delta responses).
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessage.id ? { ...message, content: textContent } : message
        )
      );

      // Persist the week's conversation in chronological order.
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: [...messages, userMessage, { role: 'assistant', content: textContent }],
          locale: locale
        })
      })

      if (!response.ok) {
        throw new Error(t('agentChat.failedToSend'))
      }
    } catch (error) {
      console.error('Chat error:', error)
      toast.error(t('agentChat.failedToSend'))

      // Replace the pending slot with the error text instead of appending a
      // second assistant message.
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessage.id
            ? { ...message, content: t('agentChat.error') }
            : message
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Newest message first.
  const reversedMessages = [...messages].reverse()

  return (
    <div className={`flex flex-col h-96 ${className}`}>
      {/* Messages Container */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-4 h-full">
          <div className="flex flex-col h-full">
            {messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">{t('agentChat.startConversation')}</p>
                  <p className="text-xs mt-2">{t('agentChat.getInsights')}</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 ">
                <div ref={messagesEndRef} />
                {reversedMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {message.role === 'assistant' && (
                          <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        {message.role === 'user' && (
                          <User className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          {message.role === 'assistant' && !message.content ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">{t('agentChat.thinking')}</span>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )}
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Input Area */}
      <div className="mt-4 flex gap-2">
        <Select
          value={selectedModel}
          onValueChange={(value) => setSelectedModel(value as AgentModel)}
        >
          <SelectTrigger
            className="w-[140px] h-[60px]"
            aria-label={t('agentChat.model') || 'Model'}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deepseek">DeepSeek</SelectItem>
            <SelectItem value="openai" disabled>OpenAI</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t('agentChat.placeholder')}
          className="flex-1 min-h-[60px] max-h-[120px] resize-none"
          disabled={isLoading}
        />
        <Button
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || isLoading}
          size="icon"
          className="h-[60px] w-[60px]"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
