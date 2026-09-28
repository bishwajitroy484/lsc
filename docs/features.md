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

## Modal form validation

Member, staff, expense, payment, staff salary, and Settings add/edit forms validate every visible required field when Save is clicked. Missing or invalid fields are highlighted and show an inline message; the form is not submitted until those fields are corrected. Conditional fields, such as expense misc details, exit dates, salary coverage dates, and optional initial-payment details, are validated when their corresponding form state makes them visible and required. Expense amount edits use the same validation as the expense form.

## Dashboard Net-In-Hand forecast

The Dashboard Net-In-Hand Prediction chart always uses an area chart, showing recognized actual collection less actual expenses through the current period, followed by an estimated trend for future periods. Forecast collections are based on active members' next payment due dates, membership frequency, and expected membership amount; overdue members and ad-hoc or trial plans are not counted as upcoming payments. Forecast expenses use the trailing 12 completed months of recorded operating expenses and paid staff salaries. Both actuals and forecasts respect the configured Anchor (cash) or Split (accrual) revenue-recognition mode and the selected year and period filters. A green dotted line and Forecast label identify projected values; tooltips distinguish actual from predicted points.

## Dashboard period filters

The Dashboard year, monthly/quarterly mode, and selected months or quarters filter the KPI totals and charts. Expense Breakdown follows those same selected periods, grouping recognized operating expenses and paid staff costs by category; misc expense details use the same period selection.

## Settings and dropdown configuration

The Settings module provides a responsive, device-compatible interface organized into two main tabs:

- **General Config:** Configures gym identity (gym name, owner email, logo URL/ID with live preview), financial and operating policies (revenue recognition method with explanatory summaries, and renewal alert buffer days), database persistence details (spreadsheet ID with copy and open actions), and custom key-value settings.
- **Dropdown Options:** Manages schema-driven dropdown categories across the application. On mobile devices, categories can be selected via touch-friendly chips or dropdown selector, and options are rendered as mobile-friendly cards with dedicated reorder, edit, and delete buttons. On tablet and desktop screens, a category sidebar and data table layout are displayed. Reorder modifications trigger a floating action toolbar positioned above mobile navigation to save or discard changes. Modals for schema editing and option values adapt responsively with required field validation.

