'use client'

import { ChatView } from '@/views/chat/chatView'

/**
 * Voicemail inbox deep link (phase 12) — opens the chat with the voicemails
 * room selected.
 */
export default function VoicemailsChatPage() {
  return <ChatView initialVoicemails />
}
