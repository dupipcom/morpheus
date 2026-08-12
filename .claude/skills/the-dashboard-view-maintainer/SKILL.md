---
name: the-dashboard-view-maintainer
description: Maintains and enhances the DashboardView analytics charts and data visualization interface.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the DashboardView analytics interface with area charts and delegated user support.

Role: You're a front-end engineer maintaining the analytics and data visualization features.

## Reference
For detailed documentation on the DashboardView's architecture, chart configurations, data processing, and user stories, read `src/views/dashboard/CLAUDE.md` first.

## Scope
- `src/views/dashboard/dashboardView.tsx` - Analytics dashboard with charts
- `src/components/ui/chart.tsx` - Recharts chart container wrapper
- `src/components/ui/dateRangeSelector.tsx` - Date range picker
- `src/components/earningsTable.tsx` - Tabular earnings display
- `src/components/agentChat.tsx` - AI chat analysis component
- `src/lib/utils/userUtils.ts` - `useHint` hook for AI analysis

## Chart Architecture
Three area charts using Recharts with weekly aggregation:

| Chart | Dimensions | Stacking |
|-------|-----------|----------|
| Mood | gratitude, optimism, restedness, tolerance, selfEsteem, trust | stackId="1" |
| Productivity | moodAverage, progress | Separate stacks |
| Money | moodAverage (scaled), profit, stash, withdrawn, balance | Mixed stacks |

## Development Rules
- Chart configs use `satisfies ChartConfig` for type safety
- Mood data filtering: exclude days where all 6 mood dimensions are zero
- Weekly data uses ISO year-aware keys: `{isoYear}-W{weekNumber}`
- Money chart scaling: `moodAverageScaled = (moodAvg / 5) * (maxValue * 0.5)`
- Progress is already 0-100 percentage, no conversion needed
- Date range selector uses `DateRangeSelector` component
- Delegated user selector must handle empty delegation list gracefully
- AgentChat is feature-flagged via `useFeatureFlag()`

## Common Operations
- **Adding a new chart dimension**: Add to config, dimension state, and data processing
- **Changing date range defaults**: Modify `daysAgo(365)` and `new Date()` initial values
- **Adding a new chart**: Add ChartDimensionSelector, ChartContainer, and data processing logic
- **Modifying AI analysis**: Update the quick question buttons or AgentChat configuration

## Validation Checklist
- [ ] Charts render with correct data for selected date range
- [ ] Chart dimension toggles show/hide data series correctly
- [ ] Delegated user dropdown shows self + authorized delegates
- [ ] Date range changes trigger data refetch
- [ ] AI analysis accordion shows insights when available
- [ ] AgentChat is hidden when feature flag is off
- [ ] Weekly aggregation handles year boundaries correctly
- [ ] Empty states handled: no data, all-zero mood days excluded
- [ ] Responsive layout works on mobile
