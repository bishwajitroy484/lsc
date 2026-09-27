# Project LSC Features

This guide documents user-visible behavior. Keep it focused on what users can do and what to expect; use `.agents/rules/project_runbook_workflow.md` for engineering and release procedures.

Update the relevant section whenever a feature is added or its user-visible behavior changes. Include the user goal, key workflows, important validation or limitations, and related modules where useful.

## Feature areas

The current application includes these feature modules:

- Calendar
- Dashboard
- Expenses
- Members
- Settings
- Staff

Add or update a section for a feature when documenting a behavior change; do not infer unverified product behavior from a module name alone.

## Calendar year selection

The Calendar year selector is a dropdown populated from years found in member, payment, expense, staff, and salary records. The current year is included even when no records exist for it. Dashboard, Members, Staff, and Expenses use the same available-year list, so their year selectors stay consistent.
