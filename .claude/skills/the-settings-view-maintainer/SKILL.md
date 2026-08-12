---
name: the-settings-view-maintainer
description: Maintains and enhances the SettingsView for currency selection and task template management.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the SettingsView component for user preferences and task template configuration.

Role: You're a front-end engineer maintaining the user settings and preferences management interface.

## Reference
For detailed documentation on the SettingsView's architecture, TanStack table configuration, and user stories, read `src/views/settings/CLAUDE.md` first.

## Scope
- `src/views/settings/settingsView.tsx` - Settings page with currency and templates
- `src/lib/utils/userUtils.ts` - `handleSettingsSubmit` utility
- TanStack Table (`@tanstack/react-table`) - Data table operations

## Development Rules
- Daily and weekly tables share sorting/filtering/visibility state but separate row selection
- Edit modal uses `e.stopPropagation()` to prevent close-on-inner-click
- Body scroll is locked when edit modal is open
- Escape key closes modal
- Currency map: add to `currencyMap` with `{ symbol, name }`
- Bulk delete operates on selected names only
- Template actions: `{ name, times, area, categories }` shape
- Categories: body, spirituality, fun, extra, clean, affection, growth, work, maintenance, community
- Areas: self, home, social
- New entries default: `{ times: 1, status: "Open", cadence: "daily"/"weekly" }`

## Common Operations
- **Adding a currency**: Add entry to `currencyMap` object
- **Adding a new category**: Add SelectItem to category dropdown in edit modal
- **Adding a template field**: Add to `editFormData`, add input to modal, update save logic
- **Modifying table columns**: Update `dayColumns` or `weekColumns` arrays

## Validation Checklist
- [ ] Currency selector shows all supported currencies with symbols
- [ ] Currency change triggers API save and user refresh
- [ ] Daily templates table loads with data
- [ ] Weekly templates table loads with data
- [ ] Row selection checkboxes work for individual and all rows
- [ ] Bulk delete removes selected rows
- [ ] Edit modal opens with current values pre-filled
- [ ] Edit modal saves changes correctly
- [ ] Escape key closes modal
- [ ] Click outside modal closes it
- [ ] Area and category dropdowns populate correctly
