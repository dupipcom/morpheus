'use client'

import React, { ReactNode } from 'react'
import { useI18n } from '@/lib/contexts/i18n'
import { Skeleton } from '@/components/ui/skeleton'

interface ContentLoadingWrapperProps {
  children: ReactNode
}

export function ContentLoadingWrapper({ children }: ContentLoadingWrapperProps) {
  const { isLoading } = useI18n()

  if (isLoading) {
    return (
      <div className="p-2 md:p-8">
        <Skeleton className="h-8 w-64 mb-4" /> {/* Title skeleton */}
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2 mb-8" />
        <Skeleton className="h-64 w-full mb-8" /> {/* Chart skeleton */}
        <Skeleton className="h-64 w-full mb-8" /> {/* Chart skeleton */}
        <Skeleton className="h-96 w-full" /> {/* Table skeleton */}
      </div>
    )
  }

  return <>{children}</>
} 