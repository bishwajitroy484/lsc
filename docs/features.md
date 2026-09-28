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

## Payment insights and dashboard collections

Member Payment Insights, Dashboard collected-revenue KPIs, and collection charts count only payments with a Paid or Completed status. Overdue, unpaid, pending, and failed payments remain visible in payment history where applicable, but are not counted as collected revenue or member earnings. The same status handling applies whether a payment status is stored as its display label or as a dropdown ID.

## Dashboard Net-In-Hand forecast

The Dashboard Net-In-Hand Prediction chart always uses an area chart, showing recognized actual collection less actual expenses through the current period, followed by an estimated trend for future periods. Forecast collections are based on active members' next payment due dates, membership frequency, and expected membership amount; overdue members and ad-hoc or trial plans are not counted as upcoming payments. Forecast expenses use the trailing 12 completed months of recorded operating expenses and paid staff salaries. Both actuals and forecasts respect the configured Anchor (cash) or Split (accrual) revenue-recognition mode and the selected year and period filters. A green dotted line and Forecast label identify projected values; tooltips distinguish actual from predicted points.

## Dashboard period filters

The Dashboard year, monthly/quarterly mode, and selected months or quarters filter the KPI totals and charts. Expense Breakdown follows those same selected periods, grouping recognized operating expenses and paid staff costs by category; misc expense details use the same period selection.
