# Template Migration Scripts

This directory contains scripts to migrate daily and weekly templates from user settings to the new Templates collection.

## Current Status

**IMPORTANT**: The migration has already been partially completed. All users currently have `dailyTemplateId` and `weeklyTemplateId` in their settings, but no actual Template records exist in the database. This means the user settings were updated to the new format, but the Template records were never created.

## Scripts

### 1. `debug-user-settings.js`
**Purpose**: Debug and inspect current user settings
**Usage**: `node scripts/debug-user-settings.js`
**Output**: Shows the current state of all user settings

### 2. `check-templates.js`
**Purpose**: Check existing templates and orphaned references
**Usage**: `node scripts/check-templates.js`
**Output**: Shows existing templates and any orphaned template ID references

### 3. `cleanup-orphaned-template-ids.js`
**Purpose**: Clean up orphaned template ID references
**Usage**: `node scripts/cleanup-orphaned-template-ids.js`
**What it does**:
- Removes `dailyTemplateId` and `weeklyTemplateId` from user settings if the referenced templates don't exist
- This should be run to clean up the current inconsistent state

### 4. `migrate-templates-dry-run.js`
**Purpose**: Preview what the migration will do without making any changes
**Usage**: `node scripts/migrate-templates-dry-run.js`
**Output**: Shows how many users have templates and what tasks they contain

### 5. `migrate-templates.js`
**Purpose**: Performs the actual migration
**Usage**: `node scripts/migrate-templates.js`
**What it does**:
- Creates new Template records for each user's dailyTemplate and weeklyTemplate
- Sets the `role` field to "default.daily" or "default.weekly"
- Updates user.settings to reference the new template IDs
- Removes the old dailyTemplate and weeklyTemplate arrays from settings

### 6. `rollback-templates.js`
**Purpose**: Reverts the migration if needed
**Usage**: `node scripts/rollback-templates.js`
**What it does**:
- Restores dailyTemplate and weeklyTemplate arrays in user.settings
- Deletes the Template records that were created during migration

## Recommended Process

Since the migration was partially completed, here's the recommended process:

1. **Backup your database** before running any scripts
2. **Debug current state**:
   ```bash
   node scripts/debug-user-settings.js
   node scripts/check-templates.js
   ```
3. **Clean up orphaned references**:
   ```bash
   node scripts/cleanup-orphaned-template-ids.js
   ```
4. **If you have users with actual template data**, run the migration:
   ```bash
   node scripts/migrate-templates-dry-run.js
   node scripts/migrate-templates.js
   ```
5. **If needed, rollback**:
   ```bash
   node scripts/rollback-templates.js
   ```

## Schema Changes

The migration adds a `role` field to the Template model:
- `"default.daily"` - for daily templates migrated from user.settings.dailyTemplate
- `"default.weekly"` - for weekly templates migrated from user.settings.weeklyTemplate
- `"custom"` - for user-created templates (future use)

## User Settings Changes

Before migration:
```json
{
  "settings": {
    "dailyTemplate": [/* Task objects */],
    "weeklyTemplate": [/* Task objects */]
  }
}
```

After migration:
```json
{
  "settings": {
    "dailyTemplateId": "template_id_here",
    "weeklyTemplateId": "template_id_here"
  }
}
```
