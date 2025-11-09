'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronUp, Send, Loader2, MessageSquare, FileText, Heart } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"
import Link from 'next/link'

export interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    profile?: {
      userName?: string
      profilePicture?: string
      firstName?: string
      lastName?: string
    }
  }
  _count?: {
    likes: number
  }
}

export interface ActivityItem {
  id: string
  type: 'note' | 'template' | string
  createdAt: string
  content?: string // For notes
  name?: string // For templates
  role?: string // For templates
  visibility?: string
  date?: string
  user?: {
    id: string
    profile?: {
      userName?: string
      profilePicture?: string
      firstName?: string
      lastName?: string
    } | null
  }
  comments?: Comment[]
  _count?: {
    comments: number
    likes?: number
  }
}

interface ActivityCardProps {
  item: ActivityItem
  onCommentAdded?: () => void
  showUserInfo?: boolean
  getTimeAgo: (date: Date) => string
}

function ActivityCard({ item, onCommentAdded, showUserInfo = false, getTimeAgo }: ActivityCardProps) {
  const { t } = useI18n()
  const { refreshAll } = useNotesRefresh()
  const [comments, setComments] = useState<Comment[]>(item.comments || [])
  const [commentCount, setCommentCount] = useState(item._count?.comments || item.comments?.length || 0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(item._count?.likes || 0)
  const [isTogglingLike, setIsTogglingLike] = useState(false)
  const [commentLikes, setCommentLikes] = useState<Record<string, { isLiked: boolean; count: number }>>({})

  // Fetch like status on mount
  useEffect(() => {
    fetchLikeStatus()
  }, [item.id, item.type])

  // Initialize comments and count from item data
  useEffect(() => {
    // Use comments from item if available
    if (item.comments && item.comments.length > 0) {
      setComments(item.comments)
      setCommentCount(item.comments.length)
      // Initialize comment likes from provided data
      const likesMap: Record<string, { isLiked: boolean; count: number }> = {}
      item.comments.forEach((comment: Comment) => {
        likesMap[comment.id] = {
          isLiked: false, // Will be fetched separately
          count: comment._count?.likes || 0
        }
      })
      setCommentLikes(likesMap)
    } else if (item._count?.comments !== undefined) {
      setCommentCount(item._count.comments)
    } else {
      fetchCommentCount()
    }
  }, [item.id, item.type, item.comments, item._count?.comments])

  // Fetch comments when expanded (only if we don't have them from item data)
  useEffect(() => {
    if (isExpanded && comments.length === 0 && commentCount > 0 && !item.comments) {
      fetchComments()
    }
  }, [isExpanded, commentCount, item.comments])

  const fetchCommentCount = async () => {
    try {
      const response = await fetch(`/api/v1/comments?entityType=${item.type}&entityId=${item.id}`)
      if (response.ok) {
        const data = await response.json()
        setCommentCount(data.comments?.length || 0)
      }
    } catch (error) {
      console.error('Error fetching comment count:', error)
    }
  }

  // Fetch like status for comments when they're loaded
  useEffect(() => {
    if (comments.length > 0) {
      comments.forEach(comment => {
        if (!commentLikes[comment.id]) {
          fetchCommentLikeStatus(comment.id)
        }
      })
    }
  }, [comments])

  const fetchLikeStatus = async () => {
    try {
      const response = await fetch(`/api/v1/likes?entityType=${item.type}&entityId=${item.id}`)
      if (response.ok) {
        const data = await response.json()
        setIsLiked(data.isLiked || false)
        setLikeCount(data.likeCount || 0)
      }
    } catch (error) {
      console.error('Error fetching like status:', error)
    }
  }

  const fetchCommentLikeStatus = async (commentId: string) => {
    try {
      const response = await fetch(`/api/v1/likes?entityType=comment&entityId=${commentId}`)
      if (response.ok) {
        const data = await response.json()
        setCommentLikes(prev => ({
          ...prev,
          [commentId]: {
            isLiked: data.isLiked || false,
            count: data.likeCount || 0
          }
        }))
      }
    } catch (error) {
      console.error('Error fetching comment like status:', error)
    }
  }

  const handleToggleLike = async () => {
    if (isTogglingLike) return

    setIsTogglingLike(true)
    try {
      const response = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityType: item.type,
          entityId: item.id
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsLiked(data.liked)
        setLikeCount(data.likeCount)
      }
    } catch (error) {
      console.error('Error toggling like:', error)
    } finally {
      setIsTogglingLike(false)
    }
  }

  const handleToggleCommentLike = async (commentId: string) => {
    try {
      const response = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'comment',
          entityId: commentId
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setCommentLikes(prev => ({
          ...prev,
          [commentId]: {
            isLiked: data.liked,
            count: data.likeCount
          }
        }))
        // Update comment in list with new like count
        setComments(prev => prev.map(comment => 
          comment.id === commentId 
            ? { ...comment, _count: { ...comment._count, likes: data.likeCount } }
            : comment
        ))
      }
    } catch (error) {
      console.error('Error toggling comment like:', error)
    }
  }

  const fetchComments = async () => {
    setIsLoadingComments(true)
    try {
      const response = await fetch(`/api/v1/comments?entityType=${item.type}&entityId=${item.id}`)
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
        setCommentCount(data.comments?.length || 0)
        // Initialize comment likes from fetched data
        const likesMap: Record<string, { isLiked: boolean; count: number }> = {}
        data.comments?.forEach((comment: Comment) => {
          likesMap[comment.id] = {
            isLiked: false, // Will be fetched separately
            count: comment._count?.likes || 0
          }
        })
        setCommentLikes(likesMap)
      }
    } catch (error) {
      console.error('Error fetching comments:', error)
    } finally {
      setIsLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/v1/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment.trim(),
          entityType: item.type,
          entityId: item.id
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Add the new comment with like count
        const newCommentWithLikes = {
          ...data.comment,
          _count: { likes: 0 }
        }
        setComments(prev => [newCommentWithLikes, ...prev])
        setCommentCount(prev => prev + 1)
        setNewComment('')
        // Refresh comments to get updated list with proper sorting
        await fetchComments()
        if (onCommentAdded) {
          onCommentAdded()
        }
        refreshAll()
      }
    } catch (error) {
      console.error('Error adding comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Comments come from API in descending order (newest first)
  // For collapsed view, show last 3 (newest 3, but display oldest first)
  // For expanded view, show all (newest first)
  const last3Comments = comments.slice(0, 3).reverse() // Show newest 3, but display oldest first
  const hasMoreComments = commentCount > 3

  const getUserName = () => {
    if (item.user?.profile?.userName) {
      return item.user.profile.userName
    }
    if (item.user?.profile?.firstName) {
      return item.user.profile.firstName
    }
    return null
  }

  const getUserDisplayName = () => {
    if (item.user?.profile) {
      const { firstName, lastName, userName } = item.user.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || userName || t('common.anonymous')
    }
    return t('common.anonymous')
  }

  const getProfilePicture = () => {
    return item.user?.profile?.profilePicture || '/images/default-avatar.webp'
  }

  const getProfileUrl = () => {
    const userName = getUserName()
    return userName ? `/profile/${userName}` : '#'
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/30 relative h-full flex flex-col">
      {showUserInfo && item.user && (
        <div className="flex items-center gap-2 mb-3">
          <img
            src={getProfilePicture()}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.src = '/images/default-avatar.webp'
            }}
          />
          {getUserName() ? (
            <Link 
              href={getProfileUrl()}
              className="text-sm font-medium text-primary hover:underline"
            >
              @{getUserName()}
            </Link>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {getUserDisplayName()}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {getTimeAgo(new Date(item.createdAt))}
          </span>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {!showUserInfo && getTimeAgo(new Date(item.createdAt))}
          {item.date && ` • ${item.date}`}
        </span>
        {item.visibility && (
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
            {item.visibility.toLowerCase().replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Content based on type */}
      {item.type === 'note' && item.content && (
        <p className="text-sm whitespace-pre-wrap mb-3">{item.content}</p>
      )}
      
      {item.type === 'template' && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">
              {item.name || item.role || t('common.untitledTemplate')}
            </p>
          </div>
          {item.content && (
            <p className="text-xs text-muted-foreground">{item.content}</p>
          )}
        </div>
      )}
      
      {/* Comment section - always show */}
      <div className="mt-3 pt-3 border-t border-border/50 flex-1 flex flex-col">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <button
            onClick={handleToggleLike}
            disabled={isTogglingLike}
            className="flex items-center gap-1 hover:opacity-70 transition-opacity disabled:opacity-50"
            aria-label={isLiked ? t('comments.unlike') : t('comments.like')}
          >
            <Heart 
              className={`h-3 w-3 ${isLiked ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} 
            />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{commentCount}</span>
          </div>
        </div>
          
          {/* Show last 3 comments when not expanded */}
          {!isExpanded && last3Comments.length > 0 && (
            <div className="space-y-2 mb-2">
              {last3Comments.map((comment) => (
                <div key={comment.id} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {comment.user.profile?.userName 
                        ? `@${comment.user.profile.userName}`
                        : comment.user.profile?.firstName 
                        ? comment.user.profile.firstName
                        : t('common.anonymous')}
                    </span>
                    <span className="text-[10px]">{getTimeAgo(new Date(comment.createdAt))}</span>
                  </div>
                  <p className="text-xs">{comment.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Show all comments when expanded */}
          {isExpanded && (
            <div className="space-y-2 mb-3 flex-1 min-h-0">
              {isLoadingComments ? (
                <div className="text-xs text-muted-foreground">{t('comments.loading')}</div>
              ) : comments.length > 0 ? (
                <div className="space-y-2 overflow-y-auto">
                  {comments.map((comment) => {
                  const commentLike = commentLikes[comment.id] || { isLiked: false, count: comment._count?.likes || 0 }
                  return (
                    <div key={comment.id} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {comment.user.profile?.userName 
                            ? `@${comment.user.profile.userName}`
                            : comment.user.profile?.firstName 
                            ? comment.user.profile.firstName
                            : t('common.anonymous')}
                        </span>
                        <span className="text-[10px]">{getTimeAgo(new Date(comment.createdAt))}</span>
                        <button
                          onClick={() => handleToggleCommentLike(comment.id)}
                          className="flex items-center gap-1 ml-auto hover:opacity-70 transition-opacity"
                          aria-label={commentLike.isLiked ? t('comments.unlikeComment') : t('comments.likeComment')}
                        >
                          <Heart 
                            className={`h-3 w-3 ${commentLike.isLiked ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} 
                          />
                          {commentLike.count > 0 && <span className="text-[10px] text-muted-foreground">{commentLike.count}</span>}
                        </button>
                      </div>
                      <p className="text-xs">{comment.content}</p>
                    </div>
                  )
                })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t('comments.noComments')}</div>
              )}
            </div>
          )}

          {/* Expand button */}
          <div className="flex justify-center mt-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="bg-background/95 backdrop-blur-sm border border-border rounded-full p-2 shadow-lg hover:bg-background transition-colors z-10"
              aria-label={isExpanded ? t('comments.showLess') : t('comments.showMore')}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-foreground" />
              )}
            </button>
          </div>

          {/* Condensed publish note field when expanded */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex gap-2">
                <Textarea
                  className="flex-1 min-h-[60px] text-sm"
                  placeholder={t('comments.addComment')}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleAddComment()
                    }
                  }}
                />
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmitting}
                  size="sm"
                  className="h-[60px] px-3"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default ActivityCard

