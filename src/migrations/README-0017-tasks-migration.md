# Migration 0017: List Tasks to Task Collection

## Overview

This migration converts all embedded tasks from Lists to the new Task collection model. It handles:

1. **Template Tasks** (`list.templateTasks[]`) - Blueprint tasks stored as embedded tasks
2. **Ephemeral Tasks** (`list.ephemeralTasks.open[]` and `list.ephemeralTasks.closed[]`) - Ad-hoc tasks that may exist in MongoDB

## What Gets Migrated

### Task Sources

- **templateTasks**: Regular recurring tasks defined on a list
- **ephemeralTasks.open**: One-off tasks that are still open
- **ephemeralTasks.closed**: One-off tasks that have been completed

### Recurrence Mapping

The migration maps list roles to task recurrence settings:

| List Role Pattern | Recurrence Frequency |
|------------------|---------------------|
| `daily.*` | DAILY |
| `weekly.*` | WEEKLY |
| All others | NONE (one-off) |

### Duplicate Prevention

The migration uses a composite key to prevent duplicates:
- Primary: `task.localeKey`
- Fallback: `task.name.toLowerCase()`

Tasks with matching keys are skipped if they already exist in the Task collection.

## Scripts

### 1. Dry Run (Preview)

**File**: `0017-migrate-list-tasks-to-collection-dry-run.js`

Preview what will be migrated without making changes:

```bash
node src/migrations/0017-migrate-list-tasks-to-collection-dry-run.js
```

**Output**: Shows how many tasks will be created for each list, which tasks already exist, and the recurrence patterns that will be applied.

### 2. Actual Migration

**File**: `0017-migrate-list-tasks-to-collection.js`

Performs the actual migration:

```bash
node src/migrations/0017-migrate-list-tasks-to-collection.js
```

**What it does**:
- Creates Task collection entries for all embedded tasks
- Assigns appropriate recurrence rules based on list role
- Updates `list.migrationMetadata` with migration status
- Skips tasks that already exist
- Provides detailed logging and error handling

## Migration Metadata

After migration, each list will have a `migrationMetadata` field:

```json
{
  "migratedAt": "2026-01-21T...",
  "migratedTaskKeys": ["drankWater", "showered", ...],
  "tasksCreated": 15,
  "tasksSkipped": 3,
  "migrationScript": "0017-migrate-list-tasks-to-collection"
}
```

## Safety Features

### Idempotency
The migration can be run multiple times safely:
- Existing tasks are detected and skipped
- No duplicate tasks are created
- Migration metadata is updated on each run

### Error Handling
- Each list is processed independently
- Errors in one list don't stop the entire migration
- Detailed error logging for troubleshooting
- Transaction-safe task creation

### Verification
After migration, the script:
- Counts total tasks created
- Identifies lists that may need manual review
- Verifies all lists with templateTasks have Task records

## Pre-Migration Checklist

Before running the migration:

1. **Backup your database** - Always backup before schema changes
2. **Run the dry-run script** - Understand what will change
3. **Check for anomalies** - Review the dry-run output for unexpected patterns
4. **Run Prisma generate** - Ensure Prisma client is up to date:
   ```bash
   npx prisma generate
   ```

## Post-Migration Verification

After running the migration:

1. **Check the console output** for the summary:
   - Tasks created
   - Tasks skipped
   - Errors encountered

2. **Verify in Prisma Studio**:
   ```bash
   npx prisma studio
   ```
   - Check Task collection has entries
   - Verify recurrence rules are correct
   - Check list.migrationMetadata field

3. **Test the application**:
   - Open ListView and verify tasks appear
   - Try completing a task
   - Check that Job records are created correctly

## Rollback

If you need to rollback:

1. **Delete migrated tasks**:
   ```javascript
   await prisma.task.deleteMany({
     where: {
       listId: { in: listIds }
     }
   })
   ```

2. **Clear migration metadata**:
   ```javascript
   await prisma.list.updateMany({
     where: { migrationMetadata: { not: null } },
     data: { migrationMetadata: null }
   })
   ```

**Note**: The original `templateTasks` and `ephemeralTasks` data remains in MongoDB and is not deleted by this migration, so rollback is always possible.

## Common Issues

### Issue: "Cannot find module '@/generated/prisma'"

**Solution**: Run `npx prisma generate` first

### Issue: Lists show 0 tasks after migration

**Possible causes**:
- Tasks might have been created but API endpoint isn't fetching them correctly
- Check list.migrationMetadata to see if migration ran
- Verify Task.listId matches the list ID

### Issue: Duplicate tasks after running migration twice

**This shouldn't happen** - the migration includes duplicate prevention. If it does:
1. Check migration metadata
2. Verify task key matching logic
3. Report as a bug

## Related Documentation

- [docs/prompts/198-tasks-and-job-collection/0001-plan-tasks-collection.md](../../docs/prompts/198-tasks-and-job-collection/0001-plan-tasks-collection.md) - Original task collection design
- [docs/prompts/198-tasks-and-job-collection/0005-plan-reconcile-tasks.md](../../docs/prompts/198-tasks-and-job-collection/0005-plan-reconcile-tasks.md) - Task reconciliation plan

## Support

If you encounter issues:

1. Check the console output for error messages
2. Review the migration metadata on affected lists
3. Check Prisma Studio for data consistency
4. Create an issue with full console output and error details
