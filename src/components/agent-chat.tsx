'use client'
import { useState, useRef, useEffect, useContext } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Send, Bot, User, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"
import { toast } from "@/components/ui/sonner"
import { getWeekNumber } from "@/app/helpers"
import { continueConversation } from "./agent-actions"
import { readStreamableValue } from '@ai-sdk/rsc';
import { GlobalContext } from "@/lib/contexts"

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface AgentChatProps {
  onMessageChange?: (message: string) => void;
  initialMessage?: string;
  history?: Message[];
  className?: string;
}

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;
export const dynamic = "force-dynamic"

export const AgentChat = ({ onMessageChange, initialMessage = "", history = [], className = "" }: AgentChatProps) => {
  const { t, locale } = useI18n()
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const [conversation, setConversation] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>(history)
  const [inputMessage, setInputMessage] = useState(initialMessage)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)


  // Focus textarea when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Notify parent component of message changes
  useEffect(() => {
    if (onMessageChange) {
      onMessageChange(inputMessage)
    }
  }, [inputMessage, onMessageChange])

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)



    try {
    //   const response = await fetch('/api/v1/chat', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       message: userMessage.content,
    //       locale: locale
    //     })
    //   })

    //   if (!response.ok) {
    //     throw new Error('Failed to send message')
    //   }

    //   const data = await response.json()

      const { messages, newMessage } = await continueConversation([
        ...conversation,
        userMessage,
      ], session?.user?.entries);

      let textContent = '';

      for await (const delta of readStreamableValue(newMessage)) {
        textContent = `${textContent}${delta}`;

        setConversation([
          { role: 'assistant', content: textContent, timestamp: new Date().toISOString()  },
            ...messages,
        ]);
      }

      const reply = { role: "assistant", content: textContent, timestamp: new Date().toISOString()}

      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: [reply, ...messages],
          locale: locale
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      // const assistantMessage: Message = {
      //   id: (Date.now() + 1).toString(),
      //   content: data.message,
      //   role: 'assistant',
      //   timestamp: new Date()
      // }

      setMessages(prev => [...prev, reply])
    } catch (error) {
      console.error('Chat error:', error)
      // toast.error(t('agentChat.failedToSend'))
      
      // const errorMessage: Message = {
      //   id: (Date.now() + 1).toString(),
      //   content: t('agentChat.error'),
      //   role: 'assistant',
      //   timestamp: new Date()
      // }
      
      // setMessages(prev => [...prev, errorMessage])
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

  const reversedMessages = [...messages].reverse()

  return (
    <div className={`flex flex-col h-96 ${className}`}>
      {/* Messages Container */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-4 h-full">
          <div className="flex flex-col h-full">
            {isLoading && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">{t('agentChat.thinking')}</span>
                      </div>
                    </div>
                  </div>
            )}
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
                {[...conversation, ...reversedMessages].map((message) => (
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
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Input Area */}
      <div className="mt-4 flex gap-2">
        <Textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
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
