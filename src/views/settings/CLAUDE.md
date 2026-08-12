# SettingsView - User Settings Management

## Purpose

The SettingsView allows users to configure their application settings including currency preference and manage their daily/weekly task template actions. It provides editable data tables for task templates with bulk selection, inline editing via modal, and currency selection from a comprehensive list of world currencies.

## File: `settingsView.tsx`

## Component Architecture

```
SettingsView
├── Currency Selection
│   └── Select dropdown (37 currencies) with symbols
├── Daily Actions Table (TanStack React Table)
│   ├── Checkbox column (select all / row select)
│   ├── Name column
│   ├── Times column (# of times per day)
│   ├── Actions column (edit / delete dropdown)
│   └── Bulk delete button (when rows selected)
├── Weekly Actions Table (TanStack React Table)
│   ├── Checkbox column (select all / row select)
│   ├── Name column
│   ├── Times column (# of times per week)
│   ├── Actions column (edit / delete dropdown)
│   └── Bulk delete button (when rows selected)
├── Add buttons (daily + weekly)
└── Edit Modal (overlay)
    ├── Name input
    ├── Times select (1-10)
    ├── Area select (self, home, social)
    ├── Category select (body, spirituality, fun, etc.)
    └── Save/Cancel buttons
```

## State Management

### GlobalContext Integration
- Reads `session` and `theme` from `GlobalContext`
- Accesses `session.user.settings` for:
  - `settings.currency.code` - current currency
  - `settings.dailyTemplate` - array of daily task actions
  - `settings.weeklyTemplate` - array of weekly task actions

### User Data
- Uses `useUserData()` for `refreshUser()` and `isLoading`
- Saves via `handleSettingsSubmit()` which calls the settings API

### TanStack React Table
- Sorting, filtering, pagination, column visibility, row selection
- Daily and weekly tables share sorting/filtering/visibility state (single state per app)
- But maintain separate row selection states

### Edit Modal State
- `isEditOpen`: Modal visibility
- `editingAction`: The action being edited (with `templateType` field)
- `editFormData`: Form fields (name, times, area, categories)

## Correlations

| Related To | Relationship |
|---|---|
| **handleSettingsSubmit** | Utility for saving settings to API |
| **useUserData** | User data refresh after saves |
| **GlobalContext** | Session and settings data |
| **DoView / ListView** | Task templates configured here appear in task lists |

## User Stories

1. **As a user**, I can select my preferred currency from a list of world currencies
2. **As a user**, I can view my daily task templates in a table
3. **As a user**, I can view my weekly task templates in a table
4. **As a user**, I can add new actions to my daily template
5. **As a user**, I can add new actions to my weekly template
6. **As a user**, I can edit existing template actions (name, frequency, area, category)
7. **As a user**, I can delete individual template actions
8. **As a user**, I can bulk-select and bulk-delete template actions
9. **As a user**, I can sort, filter, and paginate the template tables

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| Settings are saved through `handleSettingsSubmit()` utility — delegates to settings storage | | |

## Loading States

- **Loading** (`isDataLoading`): Shows `SettingsSkeleton`

## Key Behaviors

- **Escape key**: Closes the edit modal
- **Body scroll lock**: Prevents background scroll when edit modal is open
- **Currency map**: 37 supported currencies with symbols and names
- **Initial values**: New daily/weekly entries default to `{ times: 1, status: "Open", cadence: "daily"/"weekly" }`
- **Bulk delete**: Only deletes selected rows after user confirmation
- **Modal safety**: Clicking outside modal closes it (backdrop click handler)
- **Modal content click**: `e.stopPropagation()` prevents close when clicking inside modal
