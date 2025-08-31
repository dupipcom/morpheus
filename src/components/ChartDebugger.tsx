'use client'

import { hasValidMoodData, safeNumber, calculateProgressPercentage } from '@/lib/chartUtils'

interface ChartDebuggerProps {
  data: any[]
  title: string
}

export const ChartDebugger = ({ data, title }: ChartDebuggerProps) => {
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const debugInfo = {
    totalDataPoints: data.length,
    hasData: data.length > 0,
    sampleData: data.slice(0, 3),
    issues: [] as string[]
  }

  // Check for common issues
  data.forEach((item, index) => {
    if (item.mood && !hasValidMoodData(item.mood)) {
      debugInfo.issues.push(`Data point ${index}: Invalid mood data`)
    }
    
    if (item.progress !== undefined) {
      const progressNum = safeNumber(item.progress)
      if (isNaN(progressNum) || progressNum < 0) {
        debugInfo.issues.push(`Data point ${index}: Invalid progress value: ${item.progress}`)
      }
    }
    
    if (item.moodAverage !== undefined) {
      const moodNum = safeNumber(item.moodAverage)
      if (isNaN(moodNum)) {
        debugInfo.issues.push(`Data point ${index}: Invalid moodAverage: ${item.moodAverage}`)
      }
    }
  })

  if (debugInfo.issues.length === 0 && debugInfo.hasData) {
    return null // Don't show debugger if no issues
  }

  return (
    <div className="p-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <h4 className="font-semibold text-yellow-800 mb-2">Chart Debug: {title}</h4>
      <div className="text-sm text-yellow-700">
        <p>Total data points: {debugInfo.totalDataPoints}</p>
        <p>Has data: {debugInfo.hasData ? 'Yes' : 'No'}</p>
        {debugInfo.issues.length > 0 && (
          <div className="mt-2">
            <p className="font-medium">Issues found:</p>
            <ul className="list-disc list-inside">
              {debugInfo.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {debugInfo.sampleData.length > 0 && (
          <div className="mt-2">
            <p className="font-medium">Sample data:</p>
            <pre className="text-xs bg-yellow-100 p-2 rounded overflow-auto">
              {JSON.stringify(debugInfo.sampleData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
} 