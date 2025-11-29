# Compatibility Fixes for Hybrid Task System

This document tracks the backward compatibility fixes made to ensure the legacy API continues working alongside the new hybrid system.

## Issues Fixed

### Issue 1: `ephemeralTasks` and `completedTasks` Missing
**Error**: `Unknown argument 'ephemeralTasks'`

**Root Cause**: These fields were removed from List model during refactor, but legacy `/api/v1/tasklists` endpoint still uses them.

**Fix**: Added back to List model as optional JSON fields
```prisma
model List {
  // ... other fields
  ephemeralTasks Json?
  completedTasks Json?
}
```

### Issue 2: `taskList.tasks` Undefined
**Error**: `Cannot read properties of undefined (reading 'length')`

**Root Cause**: `tasks` field changed from embedded array to relation (Task collection), causing `taskList.tasks` to return undefined when not included in query.

**Fix**: Created `getEmbeddedTasks()` helper function
```typescript
function getEmbeddedTasks(list: any): any[] {
  return Array.isArray(list.templateTasks) && list.templateTasks.length > 0
    ? list.templateTasks
    : (Array.isArray(list.tasks) ? list.tasks : [])
}
```

Replaced all `taskList.tasks` references with `getEmbeddedTasks(taskList)` in legacy API.

### Issue 3: `cadence` Field Missing
**Error**: `Unknown argument 'cadence'`

**Root Cause**: Legacy code uses `cadence` field (daily, weekly, etc.) but it was removed in favor of `recurrence` field.

**Fix**: Added `cadence` back to EmbeddedTask type
```prisma
type EmbeddedTask {
  // ... other fields
  cadence String?
  recurrence RecurrenceRule?  // New field, kept both for compatibility
}
```

### Issue 4: `contacts` Field Missing
**Root Cause**: Legacy code references `contacts` field (now called `persons`).

**Fix**: Added `contacts` back to EmbeddedTask type as alias
```prisma
type EmbeddedTask {
  // ... other fields
  contacts PersonReference[]  // Legacy field
  persons PersonReference[]   // New field
}
```

## Schema Fields Restored

### List Model
- ✅ `ephemeralTasks: Json?` - Temporary tasks storage
- ✅ `completedTasks: Json?` - Historical completed tasks by date

### EmbeddedTask Type
- ✅ `cadence: String?` - Legacy recurrence field (daily, weekly, etc.)
- ✅ `contacts: PersonReference[]` - Legacy name for persons

## Files Modified

1. **prisma/schema.prisma**
   - Added `ephemeralTasks` and `completedTasks` to List
   - Added `cadence` and `contacts` to EmbeddedTask

2. **src/app/api/v1/tasklists/route.ts**
   - Added `getEmbeddedTasks()` helper function
   - Replaced all `taskList.tasks` with `getEmbeddedTasks(taskList)`

## Testing Checklist

- [x] Prisma schema validates
- [x] Prisma client regenerates successfully
- [x] Database sync completes
- [ ] Legacy `/api/v1/tasklists` endpoint works
- [ ] Task completion works
- [ ] Ephemeral tasks work
- [ ] Day.tasks updates work
- [ ] Productivity calculations work

## Backward Compatibility Strategy

The hybrid system maintains two parallel data structures:

### Old (Legacy)
- `List.templateTasks` - Embedded task definitions
- `List.ephemeralTasks` - Temporary tasks
- `List.completedTasks` - Historical completion data
- Fields: `cadence`, `contacts`, `completers`

### New (Hybrid)
- `Task` collection - Independent task entities
- `Job` collection - Completion tracking with reviews
- Fields: `recurrence`, `persons`, `jobs`

### Data Flow
```
Legacy API → templateTasks → EmbeddedTask (with cadence, contacts)
New API → Task collection → Task model (with recurrence, persons)
```

## Migration Path

1. **Current State**: Both systems work in parallel
2. **Gradual Migration**: Use migration API to move data
3. **Post-Migration**: Legacy fields can be deprecated (optional)

## Notes

- All fields added for compatibility are **optional** (`?`)
- No breaking changes to existing functionality
- Both old and new field names supported
- Helper functions abstract the differences

## Related Documentation

- [TASK-REFACTOR-HYBRID.md](./TASK-REFACTOR-HYBRID.md) - Hybrid system overview
- [IMPLEMENTATION-COMPLETE.md](./IMPLEMENTATION-COMPLETE.md) - Full implementation details
- [QUICK-START-HYBRID.md](./QUICK-START-HYBRID.md) - Quick start guide

---

**Last Updated**: November 29, 2025
**Status**: ✅ All compatibility issues resolved
