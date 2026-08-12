# DashboardView - Analytics & Data Visualization

## Purpose

The DashboardView provides visual analytics for user data including mood trends, productivity tracking, and financial metrics. It supports delegated user viewing (allowing authorized users to see others' data), date range filtering, and AI-powered chat analysis. The view renders area charts for mood, productivity, and money dimensions with weekly aggregation.

## File: `dashboardView.tsx`

## Component Architecture

```
DashboardView
├── Delegated User Selector (Select dropdown)
├── AgentChat (conditional, feature-flagged)
│   └── Quick question buttons
├── DateRangeSelector
├── Analysis Accordion (AI insights)
├── Mood Chart (AreaChart with configurable dimensions)
│   └── ChartDimensionSelector
├── Productivity Chart (AreaChart: mood vs progress)
│   └── ChartDimensionSelector
├── Money Chart (AreaChart: mood, profit, stash, withdrawn, balance)
│   └── ChartDimensionSelector
└── EarningsTable
```

## State Management

### Data Fetching
- **Day data**: Manual `fetch(/api/v1/user-dashboard-data?startDate=&endDate=&userId=)`
- **Delegated users**: `fetch(/api/v1/delegated-users)` to populate user selector
- **Hints/Analysis**: `useHint(locale, 'hint', targetUserId)` for AI-generated analysis text

### GlobalContext Integration
- Reads `session` from `GlobalContext` for auth state
- Calls `setGlobalContext` (though no explicit write in this component)

### Props
```typescript
{
  timeframe?: string              // "day" or "week" (controls aggregation)
  onDelegatedUserChange?: (user: DelegatedUserOption) => void  // Callback when delegated view changes
}
```

### Chart Dimension State
Each chart has its own visibility map for toggling individual data series:
- `moodChartDimensions`: gratitude, optimism, restedness, tolerance, selfEsteem, trust, moodAverage
- `productivityChartDimensions`: moodAverage, progress
- `moneyChartDimensions`: moodAverage, profit, stash, withdrawn, balance

## Data Processing Pipeline

### Weekly Aggregation
Daily data is aggregated by ISO week using `getWeekNumber()`:
1. Group days by `{isoYear}-W{weekNumber}` key
2. Sum numeric values, divide by count for averages
3. Sort chronologically by ISO year then week number

### Mood Data Filtering
- Days with all-zero mood values (all 6 dimensions = 0) are excluded
- Progress is already 0-100 percentage, no conversion needed

### Money Chart Scaling
- Mood average (0-5 scale) is scaled to 50% of max financial value
- Uses `moodAverageScaled = (moodAvg / 5) * (maxValue * 0.5)`

## Correlations

| Related To | Relationship |
|---|---|
| **MoodView** | Both display mood data; Dashboard shows trends, MoodView is for entry |
| **EarningsTable** | Displays financial data in tabular format below charts |
| **AgentChat** | AI chat for data analysis and coaching |
| **DateRangeSelector** | Shared date range control |
| **useHint** | Fetches AI-generated analysis text |
| **Delegation system** | Allows viewing delegated users' data |

## User Stories

1. **As a user**, I can view my mood trends over time on an area chart
2. **As a user**, I can toggle individual mood dimensions (gratitude, optimism, etc.)
3. **As a user**, I can view my productivity trends alongside mood data
4. **As a user**, I can view my financial data (profit, stash, withdrawn, balance) over time
5. **As a user**, I can change the date range to zoom in on specific time periods
6. **As a user**, I can view data for users who have delegated access to me
7. **As a user**, I can get AI-powered analysis of my data trends
8. **As a user**, I can see tabular earnings data broken down by period
9. **As a user**, I can interact with an AI agent to ask questions about my data

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/user-dashboard-data?startDate=&endDate=&userId=` | GET | Fetch day data with financials for charts |
| `/api/v1/delegated-users` | GET | Fetch delegated user options |
| `/api/v1/hint?locale=&key=hint&userId=` | GET | Fetch AI analysis text |

## Loading States

- **Loading** (`isDataLoading`): Shows `DashboardViewSkeleton`
- **No session**: Shows `DashboardViewSkeleton` as fallback
- **Content loading**: Wrapped in `ContentLoadingWrapper`

## Key Behaviors

- **Default date range**: T-1Y (365 days ago) to today
- **Feature flag**: AgentChat is only shown when `isAgentChatEnabled` is true
- **Delegate persistence**: Selected delegated user is preserved in state; falls back to current user if no delegates exist
- **Analysis accordion**: Only shown when `analysisEntries.length > 0` (non-empty insights)
