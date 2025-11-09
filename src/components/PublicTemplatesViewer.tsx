'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, FileText, List } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { OptionsButton, OptionsMenuItem } from "@/components/OptionsButton"

interface Template {
  id: string
  name: string | null
  role: string | null
  visibility: string
  createdAt: string
  updatedAt: string
}

interface TaskList {
  id: string
  name: string | null
  role: string | null
  visibility: string
  budget?: string | null
  dueDate?: string | null
  createdAt: string
  updatedAt: string
}

interface PublicTemplatesViewerProps {
  userName: string
  showCard?: boolean
  isLoggedIn?: boolean
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return 'just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`
  }
  
  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`
}

export function PublicTemplatesViewer({ userName, showCard = true, isLoggedIn = false }: PublicTemplatesViewerProps) {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<Template[]>([])
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cloningTemplateId, setCloningTemplateId] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/v1/profile/${userName}`, {
        cache: 'no-store'
      })
      
      if (!response.ok) {
        throw new Error(t('errors.failedToFetchTemplates'))
      }
      
      const data = await response.json()
      setTemplates(data.profile?.templates || [])
      setTaskLists(data.profile?.taskLists || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
      setError(t('errors.failedToLoadTemplates'))
    } finally {
      setLoading(false)
    }
  }

  const cloneTemplate = async (templateId: string, templateName: string) => {
    try {
      setCloningTemplateId(templateId)
      
      const response = await fetch(`/api/v1/templates/${templateId}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${templateName} (Cloned)`,
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
      setCloningTemplateId(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [userName])

  // Refresh when the component becomes visible (e.g., after friend status changes)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData()
      }
    }

    const handleFocus = () => {
      fetchData()
    }

    // Listen for custom friend status change events
    const handleFriendStatusChange = () => {
      fetchData()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('friendStatusChanged', handleFriendStatusChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('friendStatusChanged', handleFriendStatusChange)
    }
  }, [userName])

  if (loading) {
    const content = (
      <div className="text-center text-muted-foreground py-8">
        {t('publicProfile.loadingTemplates') || 'Loading templates...'}
      </div>
    )
    
    if (!showCard) return content
    
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('publicProfile.templates') || 'Templates & Lists'}</CardTitle>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    const content = (
      <div className="text-center text-muted-foreground py-8">
        {error}
      </div>
    )
    
    if (!showCard) return content
    
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('publicProfile.templates') || 'Templates & Lists'}</CardTitle>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    )
  }

  // Don't render anything if there are no templates or task lists
  if (templates.length === 0 && taskLists.length === 0) {
    const content = (
      <div className="text-center text-muted-foreground py-8">
        <p>No public templates or lists available yet.</p>
      </div>
    )
    
    if (!showCard) return content
    
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('publicProfile.templates') || 'Templates & Lists'}</CardTitle>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    )
  }

  const content = (
    <div className="space-y-6">
      {!showCard && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('publicProfile.templates') || 'Templates & Lists'}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}
      
      {/* Templates Section */}
      {templates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            {t('publicProfile.templatesSection') || 'Templates'}
          </h3>
          <div className="space-y-3">
            {templates.map((template) => {
              const templateOptionsItems: OptionsMenuItem[] = isLoggedIn
                ? [
                    {
                      label: cloningTemplateId === template.id 
                        ? t('publicProfile.cloning')
                        : t('publicProfile.cloneTemplate'),
                      onClick: () => cloneTemplate(template.id, template.name || 'Template'),
                      icon: null,
                    },
                  ]
                : []

              return (
                <div key={template.id} className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium">
                        {template.name || template.role || t('common.untitledTemplate')}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        Updated {getTimeAgo(new Date(template.updatedAt))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {template.visibility.toLowerCase().replace('_', ' ')}
                      </Badge>
                      {isLoggedIn && (
                        <OptionsButton
                          items={templateOptionsItems}
                          statusColor="transparent"
                          iconColor="var(--primary)"
                          iconFilled={false}
                          align="end"
                        />
                      )}
                    </div>
                  </div>
                  {template.role && (
                    <span className="text-xs text-muted-foreground">
                      {template.role}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Task Lists Section */}
      {taskLists.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center">
            <List className="h-4 w-4 mr-2" />
            {t('publicProfile.taskListsSection') || 'Task Lists'}
          </h3>
          <div className="space-y-3">
            {taskLists.map((list) => (
              <div key={list.id} className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium">
                      {list.name || list.role || t('common.untitledList')}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Updated {getTimeAgo(new Date(list.updatedAt))}
                      </span>
                      {list.budget && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            Budget: {list.budget}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2">
                    {list.visibility.toLowerCase().replace('_', ' ')}
                  </Badge>
                </div>
                {list.dueDate && (
                  <div className="mt-2">
                    <span className="text-xs text-muted-foreground">
                      Due: {list.dueDate}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (!showCard) return content

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('publicProfile.templates') || 'Templates & Lists'}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  )
}

