# Fix Financial Calculations for Task Completion

## Overview
Fixed the earnings, prize, equity, balance, and stash calculations when tasks are completed, and implemented optimistic UI updates in the doToolbar.

## Changes Made

### 1. Database Schema Update
**File**: `prisma/schema.prisma`

Added financial tracking fields to the Job model:
```prisma
model Job {
  // ... existing fields ...

  // Financial fields
  earnings  Float?
  prize     Float?
  profit    Float?

  // ... relations ...
}
```

### 2. Job Earnings Service
**File**: `src/lib/services/job/earningsService.ts` (NEW)

Created a new service to handle all financial calculations for jobs:

#### Key Functions:

1. **`calculateAndApplyJobEarnings()`**
   - Calculates earnings for a completed job
   - Fetches list details (role, budget, budgetPercentage)
   - Fetches worker's equity
   - Calculates prize and profit based on list cadence (daily/weekly/one-off)
   - Updates user's stash and profit
   - Updates Day.ticker with aggregated totals
   - Stores earnings in the Job record

2. **`reverseJobEarnings()`**
   - Reverses earnings when a job is uncompleted or rejected
   - Subtracts prize and profit from user totals
   - Recalculates Day.ticker

3. **`calculateTotalEarningsFromJobs()`**
   - Aggregates all ACCEPTED jobs for a list/date/worker
   - Returns total prize, profit, and earnings
   - Used to update Day.ticker with correct totals

4. **`updateDayTickerFromJobs()`**
   - Updates Day.ticker with total earnings from ALL jobs
   - Removes old ticker entries for the list
   - Adds new entry with aggregated totals
   - Only adds entry if there are actual earnings

### 3. API Integration

#### Job Creation Endpoint
**File**: `src/app/api/v1/jobs/route.ts`

- Added import for `calculateAndApplyJobEarnings`
- When job status is ACCEPTED, calculate and apply earnings
- Error handling to prevent job creation failure if earnings calculation fails

#### Job Validation Endpoint
**File**: `src/app/api/v1/jobs/[jobId]/route.ts`

- Added imports for `calculateAndApplyJobEarnings` and `reverseJobEarnings`
- When job is accepted: calculate and apply earnings
- When job is unaccepted/rejected: reverse earnings
- When job is deleted: reverse earnings before deletion

### 4. Optimistic UI Updates

#### DoToolbar Component
**File**: `src/components/doToolbar.tsx`

Added optimistic earnings state and calculations:

1. **State Management**:
   - `optimisticEarnings`: Tracks pending earnings updates
   - Shows with animated pulse effect
   - Auto-clears after 5 seconds

2. **`addOptimisticTaskEarnings()` Function**:
   - Calculates expected earnings immediately
   - Uses user's equity from session
   - Applies list cadence (daily/weekly/one-off)
   - Updates prize and profit badges optimistically

3. **Badge Updates**:
   - Prize badge: Shows accumulated prize with pulse animation
   - Profit badge: Shows accumulated profit with pulse animation
   - Clears when real data arrives from server

4. **Integration**:
   - Exposed through GlobalContext
   - Can be called by task handlers
   - Provides immediate feedback before API response

#### Optimistic Earnings Hook
**File**: `src/lib/hooks/useOptimisticEarnings.ts` (NEW)

Created reusable hook for optimistic earnings (for future use):
- Manages optimistic deltas
- Tracks pending completions
- Provides add/remove/clear functions
- Auto-cleanup after timeout

## How It Works

### Task Completion Flow

1. **User completes task** → Creates Job with status ACCEPTED
2. **Job API** → Calculates earnings for this single job
3. **Store in Job** → Saves earnings/prize/profit in job record
4. **Update User** → Adds prize to stash, profit to profit field
5. **Aggregate Jobs** → Calculates TOTAL earnings from ALL jobs for list/date
6. **Update Day.ticker** → Stores aggregated totals (not individual job amounts)
7. **Optimistic UI** → Shows expected earnings immediately with animation

### Financial Calculations

**Prize (from budgetPercentage)**:
- Based on user's equity (availableBalance - stash)
- Formula: `(budgetPercentage / 100) × equity ÷ numTasks`
- For daily: divide by 30
- For weekly: divide by 4

**Profit (from listBudget)**:
- Based on list's allocated budget
- Formula: `listBudget ÷ numTasks`
- For daily: divide by 30
- For weekly: divide by 4

**User Updates**:
- `stash` += prize (never goes below 0)
- `profit` += profit (never goes below 0)
- `equity` = availableBalance - stash

### Day.ticker Structure

Day.ticker now stores aggregated totals per list:
```typescript
ticker: [
  {
    listId: "list-id",
    profit: 10.50,  // Total profit from ALL jobs for this list today
    prize: 5.25     // Total prize from ALL jobs for this list today
  }
]
```

## Migration Notes

### Required Steps:
1. ✅ Update Prisma schema
2. ✅ Run `npx prisma generate`
3. ⏳ Run `npx prisma db push` to add fields to MongoDB
4. ✅ Deploy new service code
5. ✅ Update API endpoints

### Backward Compatibility:
- New fields are optional (nullable)
- Existing jobs without earnings fields will work
- Old Day.ticker entries will be replaced with new aggregated format

## Testing Checklist

- [ ] Complete a task in a list with budgetPercentage set
- [ ] Verify prize calculation is correct
- [ ] Complete a task in a list with listBudget set
- [ ] Verify profit calculation is correct
- [ ] Complete multiple tasks in same list
- [ ] Verify Day.ticker shows aggregated total
- [ ] Uncomplete a task
- [ ] Verify earnings are reversed
- [ ] Check optimistic UI animation
- [ ] Verify badges pulse when updating
- [ ] Check daily list calculations (÷ 30)
- [ ] Check weekly list calculations (÷ 4)
- [ ] Verify user's stash never goes below 0
- [ ] Verify user's profit never goes below 0

## Known Issues

- Need to run `npx prisma db push` to add new fields to database
- Optimistic UI callback needs to be wired to task handlers in parent component

## Future Improvements

- Add earnings history tracking
- Add earnings breakdown in UI
- Add support for multi-currency
- Add earnings notifications
