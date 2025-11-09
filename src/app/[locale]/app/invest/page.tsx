'use client'

import React from 'react'
import { InvestView } from '@/views/investView'

export const dynamic = 'force-dynamic'

export default function LocalizedInvest({ params }: { params: Promise<{ locale: string }> }) {
  return <InvestView />
}

