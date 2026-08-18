'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Heart, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'

interface EventComment {
  id: string
  content: string
  createdAt: string
  user: {
    profile?: {
      userName?: string | null
      profilePicture?: string | null
      firstName?: string | null
      lastName?: string | null
    } | null
  }
  _count?: { likes?: number }
}

/**
 * Comments list + add form for a social entity (GET/POST /api/v1/comments).
 * Reading is public; posting requires auth (401 → sign-in hint).
 */
export function CommentsSection({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { t, formatDate } = useI18n()

  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [requiresAuth, setRequiresAuth] = useState(false)

  const { data, mutate, isLoading } = useSWR<{ comments: EventComment[] }>(
    `/api/v1/comments?entityType=${entityType}&entityId=${entityId}`,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const comments = data?.comments || []

  const displayName = (comment: EventComment): string => {
    const profile = comment.user.profile
    if (!profile) return t('common.anonymousUser', { defaultValue: 'Anonymous' })
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
    return (
      fullName ||
      (profile.userName ? `@${profile.userName}` : t('common.anonymousUser', { defaultValue: 'Anonymous' }))
    )
  }

  const handleSubmit = async () => {
    if (!content.trim() || posting) return
    setPosting(true)
    setPostError(null)
    try {
      const res = await fetch('/api/v1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), entityType, entityId })
      })
      if (res.status === 401) {
        setRequiresAuth(true)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to post comment')
      }
      setContent('')
      await mutate()
    } catch (submitError) {
      setPostError(submitError instanceof Error ? submitError.message : 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-3">
      {requiresAuth ? (
        <p className="text-sm text-muted-foreground">
          {t('comments.signIn', { defaultValue: 'Sign in to join the conversation.' })}
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]"
            placeholder={t('comments.addComment', { defaultValue: 'Add a comment...' })}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {postError && <p className="text-sm text-destructive" role="alert">{postError}</p>}
          <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || posting}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {t('comments.post', { defaultValue: 'Post comment' })}
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</p>}

      {!isLoading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('comments.noComments', { defaultValue: 'No comments yet' })}
        </p>
      )}

      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={comment.user.profile?.profilePicture || '/images/default-avatar.webp'}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0"
              onError={(e) => {
                e.currentTarget.src = '/images/default-avatar.webp'
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{displayName(comment)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(new Date(comment.createdAt))}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{comment.content}</p>
              {(comment._count?.likes ?? 0) > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Heart className="h-3 w-3" /> {comment._count?.likes}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
