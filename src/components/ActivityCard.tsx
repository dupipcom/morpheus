'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronUp, Send, Loader2, MessageSquare, FileText, Heart, List, Edit, Trash2 } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"
import Link from 'next/link'
import { OptionsButton, OptionsMenuItem } from "@/components/OptionsButton"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover"

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
  type: 'note' | 'template' | 'tasklist' | string
  createdAt: string
  content?: string // For notes
  name?: string // For templates/tasklists
  role?: string // For templates/tasklists
  visibility?: string
  date?: string
  budget?: string | null // For tasklists
  dueDate?: string | null // For tasklists
  isLiked?: boolean // Whether current user has liked this item (if provided, skip fetching)
  userId?: string // User ID who owns this item (for checking ownership)
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
  isLoggedIn?: boolean
  currentUserId?: string | null // Current user's ID to check ownership
  onNoteUpdated?: () => void // Callback when note is updated/deleted
}

function ActivityCard({ item, onCommentAdded, showUserInfo = false, getTimeAgo, isLoggedIn = false, currentUserId, onNoteUpdated }: ActivityCardProps) {
  const { t } = useI18n()
  const { refreshAll } = useNotesRefresh()
  const [comments, setComments] = useState<Comment[]>(item.comments || [])
  const [commentCount, setCommentCount] = useState(item._count?.comments || item.comments?.length || 0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLiked, setIsLiked] = useState(item.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(item._count?.likes || 0)
  const [isTogglingLike, setIsTogglingLike] = useState(false)
  const [commentLikes, setCommentLikes] = useState<Record<string, { isLiked: boolean; count: number }>>({})
  const [isCloning, setIsCloning] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(item.content || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false)
  const justOpenedPopoverRef = useRef(false)

  // Update isLiked and likeCount when item changes (from props)
  useEffect(() => {
    if (item.isLiked !== undefined) {
      setIsLiked(item.isLiked)
    }
    if (item._count?.likes !== undefined) {
      setLikeCount(item._count.likes)
    }
  }, [item.isLiked, item._count?.likes])

  // Fetch like status on mount only if not provided in item
  useEffect(() => {
    if (item.isLiked === undefined) {
      fetchLikeStatus()
    }
  }, [item.id, item.type, item.isLiked])

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

  const handleCloneTemplate = async () => {
    if (isCloning || item.type !== 'template') return
    
    setIsCloning(true)
    try {
      const response = await fetch(`/api/v1/templates/${item.id}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${item.name || item.role || 'Template'} (Cloned)`,
        }),
      })
      
      if (!response.ok) {
        throw new Error(t('publicProfile.cloneTemplateFailed'))
      }
      
      const data = await response.json()
      
      toast.success(t('publicProfile.cloneTemplateSuccess'), {
        description: (
          <span>
            Created task list: <span className="font-semibold text-foreground">{data.taskList.name}</span>
          </span>
        ),
      })
    } catch (err) {
      console.error('Error cloning template:', err)
      toast.error(t('publicProfile.cloneTemplateFailed'))
    } finally {
      setIsCloning(false)
    }
  }

  const handleCloneTaskList = async () => {
    if (isCloning || item.type !== 'tasklist') return
    
    setIsCloning(true)
    try {
      const response = await fetch(`/api/v1/tasklists/${item.id}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${item.name || item.role || 'Task List'} (Cloned)`,
        }),
      })
      
      if (!response.ok) {
        throw new Error(t('publicProfile.cloneTemplateFailed'))
      }
      
      const data = await response.json()
      
      toast.success(t('publicProfile.cloneTemplateSuccess'), {
        description: (
          <span>
            Created task list: <span className="font-semibold text-foreground">{data.taskList.name}</span>
          </span>
        ),
      })
    } catch (err) {
      console.error('Error cloning tasklist:', err)
      toast.error(t('publicProfile.cloneTemplateFailed'))
    } finally {
      setIsCloning(false)
    }
  }

  // Check if current user owns this note
  const isNoteOwner = item.type === 'note' && currentUserId && (item.userId === currentUserId || item.user?.id === currentUserId)

  const handleEditNote = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setEditContent(item.content || '')
    // Mark that we just opened the popover to prevent immediate closing
    justOpenedPopoverRef.current = true
    // Use requestAnimationFrame to ensure dropdown closes before opening popover
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsEditPopoverOpen(true)
        // Reset the flag after a short delay
        setTimeout(() => {
          justOpenedPopoverRef.current = false
        }, 300)
      })
    })
  }

  const handleSaveNote = async () => {
    if (!editContent.trim() || isSaving) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/v1/notes/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editContent.trim(),
          visibility: item.visibility,
          date: item.date,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update note')
      }

      const data = await response.json()
      
      // Update local state
      item.content = data.note.content
      
      toast.success(t('notes.updated') || 'Note updated successfully')
      setIsEditPopoverOpen(false)
      
      if (onNoteUpdated) {
        onNoteUpdated()
      }
      refreshAll()
    } catch (err) {
      console.error('Error updating note:', err)
      toast.error(t('notes.updateFailed') || 'Failed to update note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteNote = async () => {
    if (isDeleting || !confirm(t('notes.confirmDelete') || 'Are you sure you want to delete this note?')) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/v1/notes/${item.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete note')
      }

      toast.success(t('notes.deleted') || 'Note deleted successfully')
      
      if (onNoteUpdated) {
        onNoteUpdated()
      }
      refreshAll()
    } catch (err) {
      console.error('Error deleting note:', err)
      toast.error(t('notes.deleteFailed') || 'Failed to delete note')
    } finally {
      setIsDeleting(false)
    }
  }

  // Build options menu items
  const optionsMenuItems: OptionsMenuItem[] = []
  
  // Add clone option for templates and tasklists
  if (isLoggedIn && (item.type === 'template' || item.type === 'tasklist')) {
    const cloneLabel = isCloning 
      ? (t('publicProfile.cloning') || 'Cloning...')
      : item.type === 'template'
      ? (t('publicProfile.cloneTemplate') || 'Clone Template')
      : (t('publicProfile.cloneTemplate') || 'Clone List')
    
    optionsMenuItems.push({
      label: cloneLabel,
      onClick: item.type === 'template' ? handleCloneTemplate : handleCloneTaskList,
      icon: null,
    })
  }

  // Add edit and delete options for notes owned by current user
  if (isNoteOwner) {
    optionsMenuItems.push({
      label: t('notes.edit') || 'Edit',
      onClick: handleEditNote,
      icon: <Edit className="h-4 w-4" />,
      separator: optionsMenuItems.length > 0,
    })
    optionsMenuItems.push({
      label: isDeleting 
        ? (t('notes.deleting') || 'Deleting...')
        : (t('notes.delete') || 'Delete'),
      onClick: handleDeleteNote,
      icon: <Trash2 className="h-4 w-4" />,
    })
  }

  // Debug: Log when options should be available
  if (process.env.NODE_ENV === 'development') {
    if (isLoggedIn && (item.type === 'template' || item.type === 'tasklist')) {
      console.log('ActivityCard: Should show clone option', { itemType: item.type, isLoggedIn, optionsCount: optionsMenuItems.length })
    }
    if (isNoteOwner) {
      console.log('ActivityCard: Should show edit/delete options', { itemType: item.type, currentUserId, itemUserId: item.userId, userid: item.user?.id, optionsCount: optionsMenuItems.length })
    }
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
        <div className="flex items-center gap-2">
          {item.visibility && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
              {item.visibility.toLowerCase().replace('_', ' ')}
            </span>
          )}
          {isLoggedIn && (
            <OptionsButton
              items={optionsMenuItems.length > 0 ? optionsMenuItems : []}
              statusColor="transparent"
              iconColor="var(--primary)"
              iconFilled={false}
              align="end"
            />
          )}
        </div>
      </div>

      {/* Content based on type */}
      {item.type === 'note' && item.content && (
        <p className="text-sm whitespace-pre-wrap mb-3">{item.content}</p>
      )}

      {/* Edit popover */}
      {item.type === 'note' && isNoteOwner && (
        <Popover 
          open={isEditPopoverOpen} 
          onOpenChange={(open) => {
            // Prevent closing if we just opened (to avoid dropdown close event)
            if (!open && justOpenedPopoverRef.current) {
              return
            }
            if (!open) {
              setIsEditPopoverOpen(false)
              setEditContent(item.content || '')
            }
          }}
          modal={true}
        >
          <PopoverAnchor asChild>
            <div className="absolute top-2 right-2" />
          </PopoverAnchor>
          <PopoverContent 
            className="w-[calc(100vw-2rem)] max-w-sm sm:w-96 p-4" 
            align="end" 
            side="bottom"
            onInteractOutside={(e) => {
              // Allow closing on outside click after initial open
              if (justOpenedPopoverRef.current) {
                e.preventDefault()
              }
            }}
          >
            <div className="space-y-3">
              <Textarea
                className="min-h-[120px] text-sm"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={t('notes.content') || 'Note content'}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditPopoverOpen(false)
                    setEditContent(item.content || '')
                  }}
                  disabled={isSaving}
                >
                  {t('common.cancel') || 'Cancel'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNote}
                  disabled={!editContent.trim() || isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('common.saving') || 'Saving...'}
                    </>
                  ) : (
                    t('common.save') || 'Save'
                  )}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
      
      {(item.type === 'template' || item.type === 'tasklist') && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            {item.type === 'tasklist' ? (
              <List className="w-4 h-4 text-muted-foreground" />
            ) : (
              <FileText className="w-4 h-4 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {item.name || item.role || (item.type === 'tasklist' ? t('common.untitledList') : t('common.untitledTemplate'))}
            </p>
          </div>
          {item.content && (
            <p className="text-xs text-muted-foreground">{item.content}</p>
          )}
          {item.type === 'tasklist' && (
            <div className="mt-2 space-y-1">
              {item.budget && (
                <p className="text-xs text-muted-foreground">
                  Budget: {item.budget}
                </p>
              )}
              {item.dueDate && (
                <p className="text-xs text-muted-foreground">
                  Due: {item.dueDate}
                </p>
              )}
            </div>
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

