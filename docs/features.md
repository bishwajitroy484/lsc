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

The Dashboard Net-In-Hand Prediction chart always uses an area chart, showing recognized actual collection less actual expenses through the current period, followed by an estimated trend for future periods. For future periods, projected net-in-hand accounts for both recognized revenue from active prepaid subscriptions extending into those periods (essential in Split/Accrual mode) as well as forecasted renewal collections based on active members' next payment due dates and amounts. Overdue members and ad-hoc or trial plans are not counted as upcoming renewal payments. Forecast expenses use the trailing 12 completed months of recorded operating expenses and paid staff salaries. Both actuals and forecasts respect the configured Anchor (cash) or Split (accrual) revenue-recognition mode and the selected year and period filters. A green dotted line and Forecast label identify projected values; tooltips distinguish actual from predicted points.

## Dashboard period filters

The Dashboard year, monthly/quarterly mode, and selected months or quarters filter the KPI totals and charts. Expense Breakdown follows those same selected periods, grouping recognized operating expenses and paid staff costs by category; misc expense details use the same period selection.

## Settings and dropdown configuration

The Settings module provides a responsive, device-compatible interface organized into two main tabs:

- **General Config:** Configures gym identity (gym name, owner email, and gym logo with image file upload saved directly to Google Drive, live preview tile, and stylized "LSC" fallback badge), financial and operating policies (revenue recognition method with explanatory summaries, and renewal alert buffer days), database persistence details (Google Spreadsheet ID and Google Drive storage folder ID with one-click copy and open actions), and automated notifications (ENABLE_NOTIFICATION toggle to enable/disable scheduled email alerts with a configuration modal previewing future scope dispatch rules, recipient email, and trigger frequencies).
- **Dropdown Options:** Manages schema-driven dropdown categories across the application. On mobile devices, categories can be selected via touch-friendly chips or dropdown selector, and options are rendered as mobile-friendly cards with dedicated reorder, edit, and delete buttons. On tablet and desktop screens, a category sidebar and data table layout are displayed. Reorder modifications trigger a floating action toolbar positioned above mobile navigation to save or discard changes. Modals for schema editing and option values adapt responsively with required field validation.

## Mock Data Generator

The backend includes a dedicated mock data generator (`src/MockDataGenerator.gs`) that cleans and generates synchronized, realistic mock data spanning from 1-Jan-2025 to the present date for development and testing.

- **Data scope:** Populates `MEMBERS`, `PAYMENTS`, `STAFF`, `SALARY`, and `EXPENSES` with comprehensive test scenarios while preserving `SETTINGS` and `DROP_DOWN` configurations.
- **Member renewal scenarios:** Covers upcoming renewals (due in 2 days, due in 10 days, due today), overdue members (overdue by 5, 15, and 35 days), active members with comfortable runways, and inactive/left members with exit dates.
- **Batch and plan variety:** Incorporates adult and kids morning/evening batches across monthly, quarterly, annual, ad-hoc, and trial memberships.
- **Staff and payroll:** Covers multiple gym roles (Head Coach, Personal Trainers, Kids Coach, Nutritionist, Front Desk, Housekeeping, and resigned staff), monthly salary disbursements, festive and performance bonuses, and pending salary cycles for Action Needed indicators.
- **Operational expenses:** Generates chronological recurring facility lease/rent, seasonal electricity and power utilities, cleaning and hygiene supplies, equipment servicing, broadband/software, marketing campaigns, and miscellaneous expenses with item details.
- **Clean and re-run safety:** Wipes existing data rows (rows 2+) across the target sheets and batch-inserts the new dataset in seconds, preserving row 1 headers and formula columns marked with `*`.

## Lazy Loading and High-Performance Data Tables

To deliver an instantaneous and smooth user experience across large record volumes, the Members, Staff, and Expenses modules use a progressive lazy loading rendering strategy:

- **Batch Size:** Renders records in performant chunks of 50 items.
- **Progressive Bottom Loading:** Scrolling down on both desktop table views and mobile card containers dynamically detects when the user nears the bottom, appends a lightweight shimmer/skeleton row or card placeholder, and seamlessly loads the next batch without clearing or re-rendering existing items at the top.
- **Filtering & Search:** Instant debounced search and multi-criteria filters reset the viewport and immediately render the first 50 matching results.

## Chart Styling and Mobile Toolbar Ergonomics

All ApexCharts throughout the application (Dashboard, Expenses, Staff, and Members) follow unified visual and typographic standards:

- **Consistent Data-Labels & Axes:** Data labels use styled badge containers (`11px font-size`, semi-bold weight, contrasting dark text `#0f172a`, and subtle rounded pill backgrounds `#ffffff` with 0.92 opacity). Axes and legend text are scaled to a readable `11px` to ensure effortless legibility across devices.
- **Mobile Toolbar Ergonomics:** Toolbar buttons (zoom-in, zoom-out, pan/range, and reset) feature top clearance and scaled mobile padding on small screens (`max-width: 640px`) to prevent any visual overlap with peak chart data points and labels.

