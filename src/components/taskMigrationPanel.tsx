'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ListMigrationStatus {
  listId: string
  listName: string | null
  embeddedTasksCount: number
  collectionTasksCount: number
  migrationStatus: 'migrated' | 'pending'
  needsMigration: boolean
}

interface MigrationStatus {
  lists: ListMigrationStatus[]
  summary: {
    totalLists: number
    migratedLists: number
    pendingLists: number
  }
}

export function TaskMigrationPanel() {
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/migrate/tasks')
      if (!response.ok) throw new Error('Failed to fetch migration status')
      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const migrateAll = async () => {
    setMigrating(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/v1/migrate/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!response.ok) throw new Error('Migration failed')
      const data = await response.json()
      setSuccessMessage(`Successfully migrated ${data.totalMigrated} tasks from ${data.totalLists} lists`)
      await fetchStatus() // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setMigrating(false)
    }
  }

  const migrateSingleList = async (listId: string) => {
    setMigrating(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/v1/migrate/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId })
      })
      if (!response.ok) throw new Error('Migration failed')
      const data = await response.json()
      setSuccessMessage(`Successfully migrated ${data.migratedCount} tasks`)
      await fetchStatus() // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setMigrating(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Task Migration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading migration status...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Migration to New Structure</CardTitle>
        <CardDescription>
          Migrate your tasks from the old embedded structure to the new Task collection.
          This enables advanced features like Jobs, status tracking, and better performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {status && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Summary</h3>
                <Button
                  onClick={fetchStatus}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  Refresh
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Lists</p>
                  <p className="text-2xl font-bold">{status.summary.totalLists}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Migrated</p>
                  <p className="text-2xl font-bold text-green-600">{status.summary.migratedLists}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-orange-600">{status.summary.pendingLists}</p>
                </div>
              </div>
            </div>

            {status.summary.pendingLists > 0 && (
              <Button
                onClick={migrateAll}
                disabled={migrating}
                className="w-full"
              >
                {migrating ? 'Migrating...' : `Migrate All Lists (${status.summary.pendingLists})`}
              </Button>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Lists</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {status.lists.map(list => (
                  <div
                    key={list.listId}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{list.listName || 'Unnamed List'}</p>
                      <p className="text-xs text-muted-foreground">
                        Embedded: {list.embeddedTasksCount} | Collection: {list.collectionTasksCount}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {list.migrationStatus === 'migrated' ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Migrated
                        </span>
                      ) : list.needsMigration ? (
                        <Button
                          onClick={() => migrateSingleList(list.listId)}
                          disabled={migrating}
                          size="sm"
                          variant="outline"
                        >
                          Migrate
                        </Button>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          No Tasks
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
